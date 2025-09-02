const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");
const GlobalsModel = require("../models/Globals");
const AuditTrailEntryModel = require("../models/AuditTrailEntry");
const EmployeeModel = require("../models/Employee")
const PayPeriodModel = require("../models/PayPeriod")
const PayPeriodDayModel = require("../models/PayPeriodDay")
const mongoose = require("mongoose")

const toUTCDateKey = (d) =>
  (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10); // 'YYYY-MM-DD'

const MAX_NOTES_LEN = 2000;

function normalizeNotes(v) {
  // allow clearing notes with "", null, or undefined
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.length > MAX_NOTES_LEN ? s.slice(0, MAX_NOTES_LEN) : s;
}



// function parseTimesheetEntry(timesheetEntry) {
//   const result = {};
//   const employee = timesheetEntry.employee;
//   result.employeeName = employee.employeeName;
//
//   result.payRollData = timesheetEntry.payrollData.map((prData) => {
//     let am, mid, pm, lt;
//     // AM
//     if (prData?.am) {
//       am = "P";
//     } else if ((employee?.amRate ?? 0) <= 0) {
//       am = "";
//     } else {
//       am = "A";
//     }
//     // MID
//     if (prData?.mid) {
//       mid = "P";
//     } else if ((employee?.midRate ?? 0) <= 0) {
//       mid = "";
//     } else {
//       mid = "A";
//     }
//     // PM
//     if (prData?.pm) {
//       pm = "P";
//     } else if ((employee?.pmRate ?? 0) <= 0) {
//       pm = "";
//     } else {
//       pm = "A";
//     }
//     // LT
//     if (prData?.lt) {
//       lt = "P";
//     } else if ((employee?.ltRate ?? 0) <= 0) {
//       lt = "";
//     } else {
//       lt = "A";
//     }
//
//     return {
//       payPeriodDate: prData.payPeriodDate,
//       attendence: `${am}/${mid}/${pm}/${lt}`,
//     };
//   });
//
//   result.totalDays = timesheetEntry.totalDays;
//   result.payRate =
//     employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;
//   result.cash = (employee.cashSplitPercent / 100) * result.payRate;
//   result.payroll = result.payRate - result.cash;
//   result.total = result.totalDays * result.payRate;
//   result.notes = timesheetEntry.notes;
//
//   return result;
// }

function roundTo(num, decimals = 2) {
  const p = Math.pow(10, decimals);
  const shifted = num * p;
  const rounded = Math.round(shifted);
  return +`${rounded / p}`; // convert to string then Number
}



function recomputeTotals(timesheetEntry, employee) {
  const SHIFTS = ["am", "mid", "pm", "lt"];
  const INCREMENT_CODES = new Set(["P"]);

  let totalDays = 0;    // 0, 0.5, or 1 per day
  let totalShifts = 0;  // counts all 'P' shifts
  let total = 0;        // money computed per shift

  timesheetEntry.payrollData.forEach((dayEntry) => {
    if (!dayEntry) return;

    // count P's for this day
    let matches = 0;
    for (const slot of SHIFTS) {
      if (INCREMENT_CODES.has(dayEntry[slot])) {
        matches += 1;
        // Add value of this shift using correct rate
        const rateKey = `${slot}Rate`; // amRate, midRate, pmRate, ltRate
        total += Number(employee?.[rateKey] || 0);
      }
    }

    // apply your day rules
    if (matches >= 2) totalDays += 1;
    else if (matches === 1) totalDays += 0.5;

    totalShifts += matches;
  });

  // normalize to nearest 0.5
  totalDays = Math.round(totalDays * 2) / 2;

  timesheetEntry.totalDays = totalDays;
  timesheetEntry.totalShifts = totalShifts;

  // set monetary totals
  timesheetEntry.total = total;
  const split = Number(employee?.cashSplitPercent || 0);
  timesheetEntry.cash = (split / 100) * total;
  timesheetEntry.payroll = total - timesheetEntry.cash;
}



async function getCurrentPayPeriodTimesheet(req, res, next) {
  try {
    const globals = await GlobalsModel.find({});
    const currentPayPeriodId = globals[0].currentPayPeriod;
    const currentTimesheetEntries = await PayrollTimesheetEntryModel.find({
      payPeriod: currentPayPeriodId,
    });

    res.json({ timesheetEntries: currentTimesheetEntries });
  } catch (error) {
    next(error);
  }
}

async function getTimesheetByPayPeriod(req, res, next) {
  const payPeriodId = req.params.payPeriodId;

  try {
    if (!payPeriodId) return res.status(400).json({ message: "Pay Period ID is required" });

    // 1) Get entries for this pay period (keep a stable base order)
    const entries = await PayrollTimesheetEntryModel
      .find({ payPeriod: payPeriodId })
      .sort({ _id: 1 })
      .lean();

    // 2) Fetch employee docs to know which entries are Drivers and who their Aid is
    const empIds = entries.map(e => e.employeeId).filter(Boolean);
    const employees = await EmployeeModel
      .find({ _id: { $in: empIds } }, "_id position aid")
      .lean();

    // 3) Quick lookup maps
    const empById = new Map(employees.map(e => [String(e._id), e]));
    const entryByEmpId = new Map(entries.map(e => [String(e.employeeId), e]));

    // 4) Build ordered list: Driver -> (its Aid if present), then leftovers
    const visited = new Set(); // by employeeId string
    const ordered = [];

    // First pass: place Drivers and their Aids (keep original driver order)
    for (const entry of entries) {
      const empId = String(entry.employeeId);
      if (visited.has(empId)) continue;

      // Prefer schema position, fallback to entry field
      const emp = empById.get(empId);
      const isDriver =
        (entry.employeePosition === "Driver") ||
        (emp && emp.position === "Driver");

      if (isDriver) {
        // Push driver
        ordered.push(entry);
        visited.add(empId);

        // If driver has an aid and that aid has an entry, place aid right after
        const aidId = emp?.aid ? String(emp.aid) : null;
        if (aidId) {
          const aidEntry = entryByEmpId.get(aidId);
          if (aidEntry && !visited.has(aidId)) {
            ordered.push(aidEntry);
            visited.add(aidId);
          }
        }
      }
    }

    // Second pass: append any entries not yet added (standalone Aids / others)
    for (const entry of entries) {
      const empId = String(entry.employeeId);
      if (!visited.has(empId)) {
        ordered.push(entry);
        visited.add(empId);
      }
    }

    return res.json({ timesheetEntries: ordered });
  } catch (error) {
    next(error);
  }
}

async function deleteTimesheetEntryById(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id required" });

    const deleted = await PayrollTimesheetEntryModel.findByIdAndDelete(id);
    if (!deleted)
      return res.status(404).json({ message: "Timesheet entry not found" });

    return res.json({ message: "Timesheet entry deleted", id });
  } catch (e) {
    next(e);
  }
}

// OPTIONAL: DELETE /timesheet/by-employee/:employeeId/:payPeriodId
async function deleteTimesheetByEmployeeAndPeriod(req, res, next) {
  try {
    const { employeeId, payPeriodId } = req.params;
    if (!employeeId || !payPeriodId)
      return res
        .status(400)
        .json({ message: "employeeId and payPeriodId required" });

    const result = await PayrollTimesheetEntryModel.deleteMany({
      employeeId,
      payPeriod: payPeriodId,
    });
    return res.json({
      message: "Deleted entries",
      deletedCount: result.deletedCount,
    });
  } catch (e) {
    next(e);
  }
}

async function deleteTimesheetByIdBulk(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length)
      return res.status(400).json({ message: "Provide ids: string[]" });

    const delSheets = await PayrollTimesheetEntryModel.deleteMany({ _id: { $in: ids } });

    return res.json({
      message: "Bulk delete completed",
      timesheetDeletedCount: delSheets.deletedCount,
    });
  } catch (error) {
    next(error);
  }
}

async function updateTimesheetEntry(req, res, next) {
  const { employeeId, payrollDataKey, fieldName, fieldValue } = req.body;
  console.log({ employeeId });
  try {
    const allowedFieldNames = ["am", "pm", "mid", "lt"];
    const allowedFieldValues = ["A", "P", "E", "S", "V",""];

    if (!allowedFieldNames.includes(fieldName))
      throw new Error(`Invalid field name: ${fieldName}`);
    if (!allowedFieldValues.includes(fieldValue))
      throw new Error(`Invalid field value: ${fieldValue}`);

    const globals = await GlobalsModel.find({});
    const currentPayPeriodId = globals[0].currentPayPeriod;
    const timesheetEntry = await PayrollTimesheetEntryModel.findOne({
      payPeriod: currentPayPeriodId,
      employeeId: employeeId,
    }).populate("employeeId");

    const employee = timesheetEntry.employeeId;
    if (!employee)
      throw new Error("Employee does not exist. Cannot modify this record");

    console.log({ rate: employee[`${fieldName}Rate`] });

    if (employee[`${fieldName}Rate`] <= 0)
      throw new Error(`${fieldName}Rate not set for this employee`);

    const oldPayrollData = timesheetEntry.payrollData.get(payrollDataKey);
    oldPayrollData[fieldName] = fieldValue;
    timesheetEntry.payrollData.set(payrollDataKey, {
      ...oldPayrollData,
    });
    timesheetEntry.markModified("payrollData");

    recomputeTotals(timesheetEntry, employee);

    await createAuditTrail(timesheetEntry, fieldName, fieldValue, req.user);
    const updatedTimesheetEntry = await timesheetEntry.save();
    updatedTimesheetEntry.employeeId = updatedTimesheetEntry.employeeId._id;
    res.json({ updatedTimesheetEntry });
  } catch (error) {
    next(error);
  }
}


async function createAuditTrail(timesheetEntry, fieldName, fieldValue, user) {
  const employee = timesheetEntry.employeeId;
  await AuditTrailEntryModel.create({
    targetType: "TimesheetEntry",
    targetId: timesheetEntry._id,
    timesheetEntry: timesheetEntry._id,
    changeDetails: { fieldName, fieldValue },
    payPeriod: timesheetEntry.payPeriod,
    timesheetEntryDetails: {
      totalDays: timesheetEntry.totalDays,
      total: timesheetEntry.total,
    },
    employeeDetails: {
      name: employee.employeeName,
      id: employee._id,
    },
    operation: "update", // timesheet slot edits are "update"
    userName: user.name,
    userId: user._id,
  });
}



async function createTimesheetEntryByEmpIdAndPayPeriodId(req, res, next) {
  try {
    const { employeeId, payPeriodId } = {
      employeeId: req.params.employeeId || req.body.employeeId,
      payPeriodId: req.params.payPeriodId || req.body.payPeriodId,
    };

    if (!employeeId || !payPeriodId) {
      return res
        .status(400)
        .json({ message: "employeeId and payPeriodId are required" });
    }
    if (!mongoose.isValidObjectId(employeeId) || !mongoose.isValidObjectId(payPeriodId)) {
      return res.status(400).json({ message: "Invalid employeeId or payPeriodId" });
    }

    // 1) Return existing row if it already exists (idempotent)
    const existing = await PayrollTimesheetEntryModel.findOne({
      payPeriod: payPeriodId,
      employeeId: employeeId,
    });
    if (existing) {
      return res.json({
        created: false,
        message: "Timesheet entry already exists for this employee & pay period",
        timesheetEntry: existing,
      });
    }

    // 2) Load required refs
    const [employee, payPeriod] = await Promise.all([
      EmployeeModel.findOne({_id:employeeId,isActive:true}),
      PayPeriodModel.findById(payPeriodId),
    ]);

    if (!employee) throw new Error("Employee not found");
    if (!payPeriod) throw new Error("Pay period not found");

    // 3) Build payrollData for this pay period
    const payPeriodDays = await PayPeriodDayModel.find({ payPeriod: payPeriodId });
    if (!payPeriodDays || payPeriodDays.length === 0) {
      throw new Error("No pay period days found for this pay period");
    }

    const payrollData = {};
    payPeriodDays.forEach((ppd) => {
      const key = toUTCDateKey(ppd.date);
      payrollData[key] = {
        payPeriodDate: { dayName: ppd.dayName, date: ppd.date },
        am: "",
        mid: "",
        pm: "",
        lt: "",
      };
    });

    // 4) Compute money fields
    const am = Number(employee.amRate) || 0;
    const mid = Number(employee.midRate) || 0;
    const pm = Number(employee.pmRate) || 0;
    const lt = Number(employee.ltRate) || 0;

    const payRate = am + mid + pm + lt;

    // 5) Create the entry
    const doc = await PayrollTimesheetEntryModel.create({
      payPeriod: payPeriodId,
      employeeName: employee.employeeName,
      employeeId: employee._id,
      employeePosition: employee.position,
      payrollData,        // Map schema accepts plain objects
      totalDays: 0,       // start at 0
      payRate,
      cash:0,
      payroll:0,
      total: undefined,   // optional; backend may compute later
      notes: "",
    });

    return res.status(201).json({
      created: true,
      message: "Timesheet entry created",
      timesheetEntry: doc,
    });
  } catch (error) {
    // Handle rare race condition (two concurrent creates):
    // If you add a unique compound index on (payPeriod, employeeId),
    // duplicate key errors will land here safely.
    // Example index (add to schema): timesheetSchema.index({ payPeriod: 1, employeeId: 1 }, { unique: true });
    if (error?.code === 11000) {
      try {
        const { employeeId, payPeriodId } = {
          employeeId: req.params.employeeId || req.body.employeeId,
          payPeriodId: req.params.payPeriodId || req.body.payPeriodId,
        };
        const existing = await PayrollTimesheetEntryModel.findOne({
          payPeriod: payPeriodId,
          employeeId: employeeId,
        });
        if (existing) {
          return res.json({
            created: false,
            message: "Timesheet entry already exists (race-safe).",
            timesheetEntry: existing,
          });
        }
      } catch (_) {
        // fall through to next(error)
      }
    }
    next(error);
  }
}

async function editTimesheetNotes(req, res, next) {
  const { timesheetEntryId } = req.params;
  const { notes } = req.body;

  try {
    if (!timesheetEntryId) {
      return res.status(400).json({ message: "timesheetEntryId is required" });
    }

    const updated = await PayrollTimesheetEntryModel.findByIdAndUpdate(
      timesheetEntryId,
      { $set: { notes: normalizeNotes(notes) } },
      { new: true }
    )
      // comment populate out unless you want full employee info here
      // .populate("employeeId")
      .lean();

    if (!updated) {
      return res.status(404).json({ message: "Timesheet entry not found" });
    }

    // Keep response shape consistent with your updateTimesheetEntry controller
    if (updated.employeeId && updated.employeeId._id) {
      updated.employeeId = String(updated.employeeId._id);
    } else if (updated.employeeId) {
      updated.employeeId = String(updated.employeeId);
    }

    return res.json({ updatedTimesheetEntry: updated });
  } catch (err) {
    next(err);
  }
}


module.exports = {
  getCurrentPayPeriodTimesheet,
  updateTimesheetEntry,
  getTimesheetByPayPeriod,
  deleteTimesheetEntryById,
  deleteTimesheetByEmployeeAndPeriod,
  deleteTimesheetByIdBulk,
  createTimesheetEntryByEmpIdAndPayPeriodId,
  editTimesheetNotes
};
