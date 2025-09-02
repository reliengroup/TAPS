const AuditTrailEntry = require("../models/AuditTrailEntry");

/**
 * GET /audit-trail
 * Query params:
 *  - page (number, default 1)
 *  - limit (number, default 20, max 100)
 *  - payPeriod (ObjectId as string)      // optional filter
 *  - employeeId (string)                 // optional filter (stored in employeeDetails.id)
 *  - timesheetEntryId (ObjectId string)  // optional filter
 *  - sort ("asc" | "desc", default "desc") // by createdAt
 */
async function listAuditTrail(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      payPeriod,
      employeeId,
      timesheetEntryId,
      sort = "desc",
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = {};
    if (payPeriod) filter.payPeriod = payPeriod;
    if (employeeId) filter["employeeDetails.id"] = employeeId;
    if (timesheetEntryId) filter.timesheetEntry = timesheetEntryId;

    const [items, total] = await Promise.all([
      AuditTrailEntry.find(filter)
        .sort({ createdAt: sortOrder, _id: sortOrder }) // stable sort
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        // populate if you want more context; keep light to avoid perf issues
        // .populate("timesheetEntry", "_id employee payPeriod totalDays total")
        // .populate("payPeriod", "_id startDate endDate")
        .lean(),
      AuditTrailEntry.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      page: pageNum,
      limit: limitNum,
      sort: sortOrder === -1 ? "desc" : "asc",
      total,
      totalPages,
      hasPrevPage: pageNum > 1,
      hasNextPage: pageNum < totalPages,
      data: items,
    });
  } catch (err) {
    next(err);
  }
}

// Common pagination util
function paginateParams(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(
    200,
    Math.max(1, parseInt(req.query.limit || "20", 10)),
  );
  const sort = req.query.sort === "asc" ? "asc" : "desc";
  const skip = (page - 1) * limit;
  return { page, limit, sort, skip };
}

// GET /audit-trail/timesheet
// query: page, limit, sort, payPeriod?
async function getTimesheetAudit(req, res, next) {
  try {
    const { page, limit, sort, skip } = paginateParams(req);
    const { payPeriod } = req.query;

    const filter = { targetType: "TimesheetEntry" };
    if (payPeriod) filter.payPeriod = payPeriod;

    const [total, data] = await Promise.all([
      AuditTrailEntry.countDocuments(filter),
      AuditTrailEntry.find(filter)
        .sort({ createdAt: sort === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      page,
      limit,
      sort,
      total,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      data,
    });
  } catch (err) {
    next(err);
  }
}

// GET /audit-trail/employee
// query: page, limit, sort
async function getEmployeeAudit(req, res, next) {
  try {
    const { page, limit, sort, skip } = paginateParams(req);

    const filter = { targetType: "Employee" };

    const [total, data] = await Promise.all([
      AuditTrailEntry.countDocuments(filter),
      AuditTrailEntry.find(filter)
        .sort({ createdAt: sort === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({
      page,
      limit,
      sort,
      total,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      data,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditTrail, getTimesheetAudit, getEmployeeAudit };
