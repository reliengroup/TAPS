const EmployeeModel = require("../models/Employee");
const GlobalModel = require("../models/Globals");
const PayPeriodDayModel = require("../models/PayPeriodDay");
const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");
const AuditTrailEntryModel = require("../models/AuditTrailEntry");

// Helpers
const toNum = (v) =>
  v === "" || v === null || v === undefined ? NaN : Number(v);
const pick = (obj, keys) =>
  keys.reduce(
    (acc, k) => (obj[k] !== undefined ? ((acc[k] = obj[k]), acc) : acc),
    {},
  );
const toUTCDateKey = (d) =>
  (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10); // 'YYYY-MM-DD'

// fields we care to track in employee diffs
const EMP_AUDIT_FIELDS = [
  "employeeName",
  "position",
  "amRate",
  "midRate",
  "pmRate",
  "ltRate",
  "cashSplitPercent",
  "isActive",
  "aid", // ObjectId field
];

function cleanVal(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  // normalize ObjectIds to string for diff readability
  if (typeof v === "object" && v !== null && v._id) return String(v._id);
  return v;
}

function diffEmployees(beforeDoc, afterDoc) {
  const changes = [];
  for (const field of EMP_AUDIT_FIELDS) {
    const before = cleanVal(beforeDoc ? beforeDoc[field] : undefined);
    const after = cleanVal(afterDoc ? afterDoc[field] : undefined);
    if (before !== after) {
      // only record if actually different (including create/delete cases)
      changes.push({ field, before, after });
    }
  }
  return changes;
}

async function createEmployeeAudit({ operation, beforeDoc, afterDoc, user }) {
  // pick a canonical employee identity for the audit line
  const effective = afterDoc || beforeDoc;
  const name = effective?.employeeName || "";
  const id = effective?._id ? String(effective._id) : "";

  const changeSet =
    operation === "update" ? diffEmployees(beforeDoc, afterDoc) : [];

  await AuditTrailEntryModel.create({
    targetType: "Employee",
    targetId: effective?._id || undefined,
    operation,
    employeeDetails: { name, id },
    employeeChangeSet: changeSet,
    // fill actor
    userName: user?.name || "system",
    userId: user?._id || null,
  });
}

// ===== Timesheet helpers =====
async function createTimesheetEntry(employee) {
  if (!employee.isActive) return;
  const globals = await GlobalModel.find({});
  if (globals.length < 1) return;
  const currentPayPeriodId = globals[0].currentPayPeriod;
  const payPeriodDays = await PayPeriodDayModel.find({
    payPeriod: currentPayPeriodId,
  });

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

  const payRate =
    employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;

  await PayrollTimesheetEntryModel.create({
    payPeriod: currentPayPeriodId,
    employeeName: employee.employeeName,
    employeeId: employee._id,
    employeePosition: employee.position,
    payrollData,
    payRate,
    cash:0,
    payroll:0,
  });
}

async function updateTimesheetEntry(employee) {
  const globals = await GlobalModel.find({});
  if (globals.length < 1) return;
  const currentPayPeriodId = globals[0].currentPayPeriod;

  const payRate =
    employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;

  const timesheetEntry = await PayrollTimesheetEntryModel.findOne({
    $or: [{ employee: employee._id }, { employeeId: employee._id }],
    payPeriod: currentPayPeriodId,
  });

  if (!timesheetEntry) return;

  const payload = {
    payRate,
    employeePosition: employee.position,
  };

  if (timesheetEntry && typeof timesheetEntry.totalDays === "number") {
    payload.total = timesheetEntry.totalDays * payRate;
    payload.cash = (employee.cashSplitPercent / 100) * payload.total;
    payload.payroll = payload.total - payload.cash;
  }

  await PayrollTimesheetEntryModel.findOneAndUpdate(
    {
      $or: [{ employee: employee._id }, { employeeId: employee._id }],
      payPeriod: currentPayPeriodId,
    },
    payload,
  );
}

// ===== CRUD =====

// GET /employee
async function getAllEmployees(req, res, next) {
  try {
    const employees = await EmployeeModel.find({}).populate("aid").lean();
    res.json({ employees });
  } catch (error) {
    next(error);
  }
}

// POST /employee/add
async function createEmployee(req, res, next) {
  try {
    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
      "isActive",
      "aid",
    ];
    const data = pick(req.body, allowed);

    // Coerce numerics
    data.amRate = toNum(data.amRate) || 0;
    data.midRate = toNum(data.midRate) || 0;
    data.pmRate = toNum(data.pmRate) || 0;
    data.ltRate = toNum(data.ltRate) || 0;
    data.cashSplitPercent = toNum(data.cashSplitPercent);

    if (!data.employeeName || !data.position) {
      return res
        .status(400)
        .json({ message: "employeeName and position are required" });
    }

    const ratesArr = [data.amRate, data.midRate, data.pmRate, data.ltRate];
    if (ratesArr.some((n) => isNaN(n) || n < 0)) {
      return res.status(400).json({ message: "Rates cannot be negative" });
    }

    const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
    data.dayIncrementValue =
      rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2));

    if (
      isNaN(data.cashSplitPercent) ||
      data.cashSplitPercent < 0 ||
      data.cashSplitPercent > 100
    ) {
      return res
        .status(400)
        .json({ message: "Cash split % must be between 0 and 100" });
    }

    if (data.aid) {
      const aidConnection = await EmployeeModel.findOne({
        position: "Driver",
        aid: data.aid,
      });
      if (aidConnection)
        throw new Error(
          `This aid is already connected to another driver named:${aidConnection.employeeName}`,
        );
    }

    const created = await EmployeeModel.create(data);

    // AUDIT: employee create
    await createEmployeeAudit({
      operation: "create",
      beforeDoc: null,
      afterDoc: created.toObject ? created.toObject() : created,
      user: req.user,
    });

    if (created.isActive) await createTimesheetEntry(created);
    return res.status(201).json(created);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Employee name must be unique" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

// POST /employee/bulk
async function createEmployeesBulk(req, res, next) {
  try {
    const input = Array.isArray(req.body?.employees)
      ? req.body.employees
      : Array.isArray(req.body)
        ? req.body
        : null;

    if (!input || input.length === 0) {
      return res.status(400).json({
        message:
          "Provide an array of employees in the request body, e.g. { employees: [...] } or [...].",
      });
    }

    console.log({ input });

    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
      "aid", // 👈 this is an Aid's employeeName (string), not an ObjectId
    ];

    const errors = [];
    const rows = [];

    // 1) Primitive validation + normalization
    // also collect: names in payload (for duplicate-name-in-payload check)
    const nameSeen = new Map(); // employeeName -> firstIdx
    input.forEach((raw, idx) => {
      const data = pick(raw, allowed);

      // coerce numerics
      data.amRate = toNum(data.amRate) || 0;
      data.midRate = toNum(data.midRate) || 0;
      data.pmRate = toNum(data.pmRate) || 0;
      data.ltRate = toNum(data.ltRate) || 0;
      data.cashSplitPercent = toNum(data.cashSplitPercent);

      // required
      if (!data.employeeName || !data.position) {
        errors.push({
          index: idx,
          message: "employeeName and position are required",
        });
        return;
      }

      // duplicate names in same payload (early, clearer error)
      const nm = String(data.employeeName);
      if (nameSeen.has(nm)) {
        errors.push({
          index: idx,
          message: `Duplicate employeeName '${nm}' in this upload (also at index ${nameSeen.get(nm)})`,
        });
        return;
      }
      nameSeen.set(nm, idx);

      // rates
      const ratesArr = [data.amRate, data.midRate, data.pmRate, data.ltRate];
      if (ratesArr.some((n) => isNaN(n) || n < 0)) {
        errors.push({ index: idx, message: "Rates cannot be negative" });
        return;
      }

      // cash split
      if (
        isNaN(data.cashSplitPercent) ||
        data.cashSplitPercent < 0 ||
        data.cashSplitPercent > 100
      ) {
        errors.push({
          index: idx,
          message: "Cash split % must be between 0 and 100",
        });
        return;
      }

      // dayIncrementValue
      const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
      data.dayIncrementValue =
        rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2));

      // aid string: trim/normalize empty -> remove
      if (typeof data.aid === "string") {
        data.aid = data.aid;
        if (!data.aid) delete data.aid;
      } else {
        delete data.aid;
      }

      // Only Drivers can have an aid
      if (data.aid && data.position !== "Driver") {
        errors.push({ index: idx, message: "Only a Driver can have an aid" });
        return;
      }

      rows.push({ _idx: idx, data });
    });

    if (rows.length === 0) {
      return res.status(400).json({
        message: "No valid employee records to insert",
        failedCount: errors.length,
        failed: errors,
      });
    }

    // 2) Separate payload aids and non-aids for staged insert
    const payloadAidRows = rows.filter((r) => r.data.position === "Aide");
    const payloadNonAidRows = rows.filter((r) => r.data.position !== "Aide");

    // 3) Insert all Aids from payload first (ordered=false so we keep partials)
    let insertedAids = [];
    if (payloadAidRows.length > 0) {
      try {
        insertedAids = await EmployeeModel.insertMany(
          payloadAidRows.map((r) => r.data),
          { ordered: false },
        );
      } catch (e) {
        if (e?.insertedDocs) insertedAids = e.insertedDocs;
        if (e?.writeErrors?.length) {
          e.writeErrors.forEach((we) => {
            const row = payloadAidRows[we?.index ?? 0];
            errors.push({
              index: row?._idx ?? -1,
              message: "Employee name must be unique",
            });
          });
        }
      }
    }

    // Build a name -> aidDoc map from newly inserted aids
    const freshAidByName = new Map(
      insertedAids.map((a) => [String(a.employeeName), a]),
    );

    // 4) For drivers with an `aid` name, resolve to an Aid employee:
    //    first from newly inserted aids, then from DB existing Aid employees.
    const driversNeedingAid = payloadNonAidRows.filter(
      (r) => r.data.position === "Driver" && r.data.aid,
    );

    // collect unique aid names referenced by drivers
    const aidNamesNeeded = [
      ...new Set(driversNeedingAid.map((r) => String(r.data.aid))),
    ];

    // Find existing Aid employees by those names (skip ones we just created)
    let existingAids = [];
    if (aidNamesNeeded.length > 0) {
      existingAids = await EmployeeModel.find(
        { position: "Aide", employeeName: { $in: aidNamesNeeded } },
        "_id employeeName position",
      ).lean();
    }
    const dbAidByName = new Map(
      existingAids.map((a) => [String(a.employeeName), a]),
    );

    // validation + resolution (unchanged logic, but now we’re guaranteed they’re Aids)
    driversNeedingAid.forEach(({ data, _idx }) => {
      const nm = String(data.aid);
      const fresh = freshAidByName.get(nm);
      const found = fresh || dbAidByName.get(nm);

      if (!found) {
        errors.push({ index: _idx, message: `Aide '${nm}' not found` });
        return;
      }
      // found.position must be "Aid" now, but keep this guard for safety:
      if (found.position !== "Aide") {
        errors.push({
          index: _idx,
          message: `Referenced employee '${nm}' is not an Aid`,
        });
        return;
      }

      data._resolvedAidId = found._id;
    });

    // --- just before building toInsertNonAid, add a last-chance resolver:
    const nameToAidId = new Map([
      ...Array.from(freshAidByName.entries()).map(([n, a]) => [n, a._id]),
      ...Array.from(dbAidByName.entries()).map(([n, a]) => [n, a._id]),
    ]);

    const validNonAidRows = payloadNonAidRows.filter(
      (r) => !errors.some((e) => e.index === r._idx),
    );

    // If an aid name is present but _resolvedAidId somehow wasn’t set, try once more
    for (const r of validNonAidRows) {
      const { data } = r;
      if (data.aid && !data._resolvedAidId) {
        const maybeId = nameToAidId.get(String(data.aid));
        if (maybeId) data._resolvedAidId = maybeId;
      }
    }

    console.log({ driversNeedingAid });
    // 5) Ensure aids referenced by drivers are not already linked to other drivers in DB
    const resolvedAidIds = [
      ...new Set(
        driversNeedingAid
          .map((r) => r.data._resolvedAidId)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    console.log({ resolvedAidIds });

    if (resolvedAidIds.length > 0) {
      const dbConflicts = await EmployeeModel.find(
        { position: "Driver", aid: { $in: resolvedAidIds } },
        "_id employeeName aid",
      ).lean();
      const takenAid = new Set(dbConflicts.map((d) => String(d.aid)));
      driversNeedingAid.forEach(({ data, _idx }) => {
        if (data._resolvedAidId && takenAid.has(String(data._resolvedAidId))) {
          errors.push({
            index: _idx,
            message: `Aide '${data.aid}' is already connected to another driver`,
          });
        }
      });
    }

    // 6) Prevent same aid being assigned to multiple drivers within this payload
    const aidUseCounter = new Map(); // aidId -> count
    driversNeedingAid.forEach(({ data }) => {
      if (!data._resolvedAidId) return;
      const key = String(data._resolvedAidId);
      aidUseCounter.set(key, (aidUseCounter.get(key) || 0) + 1);
    });
    for (const [aidId, cnt] of aidUseCounter.entries()) {
      if (cnt > 1) {
        driversNeedingAid.forEach(({ data, _idx }) => {
          if (String(data._resolvedAidId) === aidId) {
            errors.push({
              index: _idx,
              message:
                "This aid is referenced by multiple new drivers in the same upload",
            });
          }
        });
      }
    }

    // Convert resolved aidId and strip helper fields
    const toInsertNonAid = validNonAidRows.map(({ data }) => {
      const out = { ...data };
      console.log({ out });
      if (out._resolvedAidId) {
        out.aid = out._resolvedAidId; // store ObjectId in DB
        delete out._resolvedAidId;
      } else {
        // no aid or unresolved -> ensure field not present
        delete out.aid;
      }
      return out;
    });

    // If nothing valid to insert now and no aids inserted either, bail
    if (toInsertNonAid.length === 0 && insertedAids.length === 0) {
      return res.status(400).json({
        message: "No valid employee records to insert",
        failedCount: errors.length,
        failed: errors,
      });
    }

    // 7) Insert remaining (Drivers + other non-Aid roles)
    let insertedNonAids = [];
    console.log({ toInsertNonAid });
    if (toInsertNonAid.length > 0) {
      try {
        insertedNonAids = await EmployeeModel.insertMany(toInsertNonAid, {
          ordered: false,
        });
      } catch (e) {
        if (e?.insertedDocs) insertedNonAids = e.insertedDocs;
        if (e?.writeErrors?.length) {
          e.writeErrors.forEach((we) => {
            // map back to original index for error reporting
            const row = validNonAidRows[we?.index ?? 0];
            errors.push({
              index: row?._idx ?? -1,
              message: "Employee name must be unique",
            });
          });
        }
      }
    }

    const inserted = [...insertedAids, ...insertedNonAids];

    // 8) Create initial timesheets for active employees
    for await (const doc of inserted) {
      try {
        await createEmployeeAudit({
          operation: "create",
          beforeDoc: null,
          afterDoc: doc.toObject ? doc.toObject() : doc,
          user: req.user,
        });
        await createTimesheetEntry(doc);
      } catch {
        // not fatal
        const originalIdx =
          rows.find((r) => r.data.employeeName === doc.employeeName)?._idx ??
          -1;
        errors.push({
          index: originalIdx,
          message: "Inserted but failed to make initial timesheet entry",
        });
      }
    }

    const partial = errors.length > 0;
    return res.status(partial ? 207 : 201).json({
      message: partial
        ? "Bulk insert completed with some errors"
        : "Bulk insert successful",
      insertedCount: inserted.length,
      failedCount: errors.length,
      failed: errors,
      inserted,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Duplicate employee name in bulk payload" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

// PUT /employee/:id
async function updateEmployee(req, res, next) {
  try {
    const { id } = req.params;

    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
      "isActive",
      "aid",
    ];
    const update = pick(req.body, allowed);

    if (update.amRate !== undefined) update.amRate = toNum(update.amRate);
    if (update.midRate !== undefined) update.midRate = toNum(update.midRate);
    if (update.pmRate !== undefined) update.pmRate = toNum(update.pmRate);
    if (update.ltRate !== undefined) update.ltRate = toNum(update.ltRate);
    if (update.cashSplitPercent !== undefined)
      update.cashSplitPercent = toNum(update.cashSplitPercent);

    const { amRate, midRate, pmRate, ltRate, cashSplitPercent } = update;
    const ratesArr = [amRate, midRate, pmRate, ltRate];

    if (ratesArr.some((n) => n !== undefined && (isNaN(n) || n < 0))) {
      return res.status(400).json({ message: "Rates cannot be negative" });
    }

    const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
    update.dayIncrementValue =
      rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2));

    if (
      cashSplitPercent !== undefined &&
      (isNaN(cashSplitPercent) ||
        cashSplitPercent < 0 ||
        cashSplitPercent > 100)
    ) {
      return res
        .status(400)
        .json({ message: "Cash split % must be between 0 and 100" });
    }

    const employee = await EmployeeModel.findById(id);
    const beforeSnapshot = employee.toObject();

    if (update.position === "Driver" && employee.position === "Aide") {
      await EmployeeModel.findOneAndUpdate({ aid: id }, { aid: null });
    }

    if (update.aid) {
      const aidConnection = await EmployeeModel.findOne({
        position: "Driver",
        aid: update.aid,
      });
      if (aidConnection && aidConnection._id.toString() !== id)
        throw new Error(
          `This aid is already connected to another driver named:${aidConnection.employeeName}`,
        );
    }

    const updated = await EmployeeModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!updated)
      return res.status(404).json({ message: "Employee not found" });

    // AUDIT: employee update with field-level diff
    await createEmployeeAudit({
      operation: "update",
      beforeDoc: beforeSnapshot,
      afterDoc: updated.toObject ? updated.toObject() : updated,
      user: req.user,
    });

    if (updated.isActive) await updateTimesheetEntry(updated);

    return res.json({
      message: "Employee updated successfully",
      employee: updated,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Employee name must be unique" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

async function getAllAids(req, res, next) {
  const aidId = req.params.aidId;
  const employeeId = req.params.employeeId;
  try {
    const nonVacantAids = await EmployeeModel.find({
      position: "Driver",
      aid: { $ne: null },
    }).select("aid");

    const nonVacantAidsSet = new Set(
      nonVacantAids.map((a) => a.aid.toString()),
    );

    const aids = await EmployeeModel.find({ position: "Aide" });
    const vacantAids = aids.filter(
      (a) => !nonVacantAidsSet.has(a._id.toString()) && a._id.toString() !== employeeId,
    );

    if (aidId) {
      try {
        const currentDriverAid = await EmployeeModel.findById(aidId);
        if (currentDriverAid) vacantAids.push(currentDriverAid);
      } catch (error) {
        
      }
    }

    res.json({ aids: vacantAids });
  } catch (error) {
    next(error);
  }
}

// DELETE /employee/:id
async function deleteEmployee(req, res, next) {
  try {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ message: "Employee id is required" });

    const toDelete = await EmployeeModel.findById(id);
    if (!toDelete)
      return res.status(404).json({ message: "Employee not found" });

    const deleted = await EmployeeModel.findByIdAndDelete(id);
    // AUDIT: employee delete (store snapshot in 'before', 'after' is null)
    await createEmployeeAudit({
      operation: "delete",
      beforeDoc: toDelete.toObject ? toDelete.toObject() : toDelete,
      afterDoc: null,
      user: req.user,
    });

    // remove related timesheet entries
    // await PayrollTimesheetEntryModel.deleteMany({ $or: [{ employeeId: id }, { employee: id }] });

    return res.json({
      message: "Employee deleted successfully",
      employeeId: id,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    next(error);
  }
}

// POST /employee/bulk-delete
async function deleteEmployeesBulk(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length)
      return res.status(400).json({ message: "Provide ids: string[]" });
    const victims = await EmployeeModel.find({ _id: { $in: ids } }).lean();
    const delEmp = await EmployeeModel.deleteMany({ _id: { $in: ids } });

    // AUDIT: one entry per deleted employee (keeps per-employee traceability)
    for (const v of victims) {
      try {
        await createEmployeeAudit({
          operation: "delete",
          beforeDoc: v,
          afterDoc: null,
          user: req.user,
        });
      } catch { }
    }
    return res.json({
      message: "Bulk delete completed",
      deletedCount: delEmp.deletedCount,
    });
  } catch (error) {
    next(error);
  }
}

async function getEmployeeById(req, res, next) {
  const employeeId = req.params.employeeId;
  try {
    const employee = await EmployeeModel.findById(
      employeeId,
      "_id employeeName",
    );
    if (!employee) return res.json({ employee: { _id: "" } });
    console.log({ employee });
    res.json({ employee });
  } catch (error) {
    next(error);
  }
}

async function getEmployeesWithNoTimesheetEntry(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  try {
    const timeSheets = await PayrollTimesheetEntryModel.find(
      { payPeriod: payPeriodId },
      "employeeId",
    );
    const idsWithTimesheets = timeSheets.map((t) => t.employeeId);
    const employees = await EmployeeModel.find(
      { _id: { $nin: idsWithTimesheets }, isActive: true },
      "_id employeeName",
    );
    res.json({ employees });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllEmployees,
  createEmployee,
  updateEmployee,
  createEmployeesBulk,
  deleteEmployee,
  deleteEmployeesBulk,
  getAllAids,
  getEmployeeById,
  getEmployeesWithNoTimesheetEntry,
};
