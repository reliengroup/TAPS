const indexRouter = require("express").Router();
const employeeRouter = require("./employee");
const payPeriodRouter = require("./payPeriod");
const timesheetRouter = require("./timesheetEntry");
const auditTrailRouter = require("./auditTrail");
const userRouter = require("./user")

indexRouter.use("/employee", employeeRouter);
indexRouter.use("/pay-period", payPeriodRouter);
indexRouter.use("/timesheet", timesheetRouter);
indexRouter.use("/audit-trail",auditTrailRouter);
indexRouter.use("/users",userRouter);

module.exports = indexRouter;
