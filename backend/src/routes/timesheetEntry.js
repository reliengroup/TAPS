const {  getCurrentPayPeriodTimesheet,deleteTimesheetEntryById,deleteTimesheetByEmployeeAndPeriod, updateTimesheetEntry, getTimesheetByPayPeriod, deleteTimesheetByIdBulk, createTimesheetEntryByEmpIdAndPayPeriodId, editTimesheetNotes } = require("../controllers/timesheetEntry");
const { requireAuth } = require("../middlewares/auth");

const router = require("express").Router()

router.get("/",requireAuth,getCurrentPayPeriodTimesheet);
router.put("/",requireAuth,updateTimesheetEntry);
router.get("/:payPeriodId",requireAuth,getTimesheetByPayPeriod);
router.delete("/:id",requireAuth, deleteTimesheetEntryById);
router.post("/bulk-delete",requireAuth,deleteTimesheetByIdBulk)
router.post(
  "/create-by-emp/:employeeId/pay-period/:payPeriodId",
  requireAuth,
  createTimesheetEntryByEmpIdAndPayPeriodId
);
router.put("/notes/:timesheetEntryId", requireAuth, editTimesheetNotes);

// OPTIONAL: delete by employee + pay period combo
router.delete("/by-employee/:employeeId/:payPeriodId",requireAuth, deleteTimesheetByEmployeeAndPeriod);
module.exports = router;
