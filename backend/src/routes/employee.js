const router = require("express").Router();
const { createEmployeesBulk,  getAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  deleteEmployeesBulk,
  getAllAids,
  getEmployeeById,
  getEmployeesWithNoTimesheetEntry
 } = require("../controllers/employee");
const { requireAuth } = require("../middlewares/auth");


router.get("/",requireAuth, getAllEmployees);
router.get("/by-id/:employeeId",requireAuth,getEmployeeById)
router.get("/with-no-timesheet-entry/:payPeriodId",requireAuth,getEmployeesWithNoTimesheetEntry)
router.get("/aids/:aidId/employee/:employeeId",requireAuth,getAllAids);
router.post("/add",requireAuth, createEmployee);
router.post("/bulk",requireAuth,createEmployeesBulk)
router.put("/:id",requireAuth, updateEmployee);
router.delete("/:id",requireAuth,deleteEmployee)
router.post("/bulk-delete",requireAuth, deleteEmployeesBulk);



module.exports = router;
