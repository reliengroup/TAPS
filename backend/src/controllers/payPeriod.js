const PayPeriodModel = require("../models/PayPeriod");
const PayPeriodDayModel = require("../models/PayPeriodDay");
const EmployeeModel = require("../models/Employee");
const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");
const GlobalsModel = require("../models/Globals");

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** UTC helpers */
const toUTCDate = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const toISODate = (d) => toUTCDate(d).toISOString().slice(0, 10);
const addUtcDays = (d, n) => {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const isMondayUTC = (d) => d.getUTCDay() === 1;
const nextMondayUTC = (from) => {
  // Get next Monday strictly after "from" (UTC midnight baseline)
  const base = toUTCDate(from);
  let days = (8 - base.getUTCDay()) % 7;
  if (days === 0) days = 7; // ensure strictly next
  return addUtcDays(base, days);
};

async function ensureGlobals() {
  let g = await GlobalsModel.findOne({});
  if (!g) {
    g = await GlobalsModel.create({
      currentPayPeriod: null,
      autoCreatePayPeriods: false,
    });
  } else if (typeof g.autoCreatePayPeriods !== "boolean") {
    // keep default false if not set
    await GlobalsModel.findByIdAndUpdate(g._id, {
      $set: { autoCreatePayPeriods: !!g.autoCreatePayPeriods },
    });
  }
  return await GlobalsModel.findOne({});
}

/** builds the 10 work days payload Mon–Fri × 2 weeks */
function buildPayPeriodDaysPayload(start) {
  // offsets Mon–Fri (0..4) and next week Mon–Fri (7..11)
  const offsets = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];
  return offsets.map((offset) => {
    const dayUTC = addUtcDays(start, offset);
    return {
      dayName: DAY_NAMES[dayUTC.getUTCDay()],
      date: dayUTC,
    };
  });
}

async function createTimesheetsForEmployees(payPeriodDoc, payPeriodDaysDocs) {
  const employees = await EmployeeModel.find(
    { isActive: true },
    "_id employeeName position amRate midRate pmRate ltRate cashSplitPercent",
  );

  const payrollTimesheetEntriesPayload = employees.map((employee) => {
    const payrollData = {};
    payPeriodDaysDocs.forEach((ppd) => {
      const key = toISODate(ppd.date); // 'YYYY-MM-DD' stable key
      payrollData[key] = {
        payPeriodDate: { dayName: ppd.dayName, date: ppd.date },
        am: "",
        mid: "",
        pm: "",
        lt: "",
      };
    });

    const payRate =
      (employee.amRate || 0) +
      (employee.midRate || 0) +
      (employee.pmRate || 0) +
      (employee.ltRate || 0);

    return {
      payPeriod: payPeriodDoc._id,
      employeeId: employee._id,
      employeeName: employee.employeeName,
      employeePosition: employee.position,
      payrollData,
      payRate,
    };
  });

  if (payrollTimesheetEntriesPayload.length > 0) {
    await PayrollTimesheetEntryModel.insertMany(payrollTimesheetEntriesPayload);
  }
}

/** Core create function reused by manual + auto */
async function createPayPeriodWithStart(startUtcMonday) {
  if (!isMondayUTC(startUtcMonday)) {
    throw new Error("startDate must be a Monday (UTC)");
  }

  // endDate = start + 11 days (Mon–Fri × 2 weeks)
  const endDate = addUtcDays(startUtcMonday, 11);

  const newPayPeriod = await PayPeriodModel.create({
    startDate: startUtcMonday,
    endDate,
  });

  const dayPayload = buildPayPeriodDaysPayload(startUtcMonday).map((d) => ({
    ...d,
    payPeriod: newPayPeriod._id,
  }));

  const newPayPeriodDays = await PayPeriodDayModel.insertMany(dayPayload);

  // set current pay period in globals
  const globals = await ensureGlobals();
  await GlobalsModel.findByIdAndUpdate(globals._id, {
    $set: { currentPayPeriod: newPayPeriod._id },
  });

  // make timesheets
  await createTimesheetsForEmployees(newPayPeriod, newPayPeriodDays);

  return newPayPeriod;
}

// POST /pay-period
async function createNewPayPeriod(req, res, next) {
  const { startDate } = req.body;

  try {
    if (!startDate) {
      return res.status(400).json({ message: "startDate is required" });
    }
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid startDate" });
    }
    const startUtc = toUTCDate(start);
    if (!isMondayUTC(startUtc)) {
      return res.status(400).json({ message: "startDate must be a Monday" });
    }

    await createPayPeriodWithStart(startUtc);
    res.json({ success: true });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Pay Period Start Date must be unique" });
    }
    next(error);
  }
}

// GET /pay-period
async function getAllPayPeriods(req, res, next) {
  try {
    const payPeriods = await PayPeriodModel.find({}).sort({ startDate: -1 });
    res.json({ payPeriods });
  } catch (error) {
    next(error);
  }
}

// GET /pay-period/current-id
async function getCurrentPayPeriodId(req, res, next) {
  try {
    const globals = await ensureGlobals();
    if (!globals?.currentPayPeriod) {
      return res.json({ currentPayPeriodId: null });
    }
    res.json({ currentPayPeriodId: globals.currentPayPeriod });
  } catch (error) {
    next(error);
  }
}

// GET /pay-period/details/:payPeriodId
async function getPayPeriodDetails(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  try {
    if (!payPeriodId) throw new Error("id required in url");
    const payPeriod = await PayPeriodModel.findById(payPeriodId);
    res.json({ payPeriod });
  } catch (error) {
    next(error);
  }
}

// GET /pay-period/days/:payPeriodId
async function getPayPeriodDays(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  try {
    if (!payPeriodId) throw new Error("payPeriodId required in url");
    const days = await PayPeriodDayModel.find({ payPeriod: payPeriodId });
    res.json({ days });
  } catch (error) {
    next(error);
  }
}

/** NEW: GET /pay-period/auto-creation — returns { enabled } */
async function getAutoCreation(req, res, next) {
  try {
    const g = await ensureGlobals();
    res.json({ enabled: !!g.autoCreatePayPeriods });
  } catch (e) {
    next(e);
  }
}

/** NEW: PUT /pay-period/auto-creation { enabled: boolean } */
async function setAutoCreation(req, res, next) {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled (boolean) is required" });
    }
    const g = await ensureGlobals();
    await GlobalsModel.findByIdAndUpdate(g._id, {
      $set: { autoCreatePayPeriods: enabled },
    });
    res.json({ enabled });
  } catch (e) {
    next(e);
  }
}

/**
 * Determine if we need to auto-create the next pay period.
 * Rule: if today (UTC midnight) is AFTER current endDate, and autoCreatePayPeriods is true,
 * create a new period starting the NEXT Monday after endDate.
 */
async function checkAndAutoCreateIfNeeded() {
  const globals = await ensureGlobals();
  if (!globals?.autoCreatePayPeriods)
    return { created: false, reason: "auto disabled" };

  // fetch current period
  let current = null;
  if (globals.currentPayPeriod) {
    current = await PayPeriodModel.findById(globals.currentPayPeriod);
  }

  // If no current period, start from next Monday from today
  const todayUtc = toUTCDate(new Date());

  if (!current) {
    const start = nextMondayUTC(todayUtc);
    await createPayPeriodWithStart(start);
    return { created: true, reason: "no current; bootstrapped" };
  }

  const endUtc = toUTCDate(new Date(current.endDate));
  if (todayUtc.getTime() > endUtc.getTime()) {
    // compute next period start = next Monday after endDate
    const start = nextMondayUTC(endUtc);
    await createPayPeriodWithStart(start);
    return { created: true, reason: "rolled to next period" };
  }

  return { created: false, reason: "current still active" };
}

/** NEW: POST /pay-period/ensure — safe manual trigger */
async function ensureCurrentPayPeriod(req, res, next) {
  try {
    const result = await checkAndAutoCreateIfNeeded();
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

async function editPayDay(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  const { payDay } = req.body;
  try {
    if (!payDay) throw new Error("Pay day is required");
    const payPeriod = await PayPeriodModel.findById(payPeriodId);
    if (!payPeriod) throw new Error("Pay period with this id does not exist");

    const payDayDate = new Date(payDay);
    if (payDayDate < payPeriod.endDate)
      throw new Error("Pay day cannot not be before pay period end date");

    payPeriod.payDay = payDayDate;
    const updated = await payPeriod.save();

    res.json({ payPeriod: updated });
  } catch (error) {
    next(error);
  }
}

/** OPTIONAL: lightweight in-process scheduler (runs hourly) */
(function attachHourlyAutoCreation() {
  // Avoid attaching multiple times in test/workers; adjust as needed.
  if (process.env.PP_SCHEDULER_ATTACHED) return;
  process.env.PP_SCHEDULER_ATTACHED = "1";

  // Run every hour
  setInterval(
    async () => {
      try {
        await checkAndAutoCreateIfNeeded();
      } catch {
        /* swallow to avoid crashing */
      }
    },
    60 * 60 * 1000,
  );

  // Also run once shortly after boot
  setTimeout(() => {
    checkAndAutoCreateIfNeeded().catch(() => { });
  }, 10 * 1000);
})();

module.exports = {
  createNewPayPeriod,
  getAllPayPeriods,
  getCurrentPayPeriodId,
  getPayPeriodDetails,
  getPayPeriodDays,
  // new
  getAutoCreation,
  setAutoCreation,
  ensureCurrentPayPeriod,
  editPayDay
};
