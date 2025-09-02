
// routes/auditTrail.routes.js
const express = require("express");
const router = express.Router();
const { listAuditTrail, getTimesheetAudit, getEmployeeAudit } = require("../controllers/auditTrail");
const { requireAuth } = require("../middlewares/auth");

router.get("/",requireAuth, listAuditTrail);
router.get("/timesheet",  requireAuth,  getTimesheetAudit);
router.get("/employee",   requireAuth, getEmployeeAudit);

module.exports = router;
