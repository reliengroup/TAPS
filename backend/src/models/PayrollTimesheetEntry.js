const mongoose = require("mongoose");

const dayEntrySchema = new mongoose.Schema(
  {
    payPeriodDate: {
      dayName: { type: String },
      date: { type: Date },
    },
    am: { type: String, enum: ["A", "P", "E", "S", "V", ""], default: "" },
    mid:{ type: String, enum: ["A", "P", "E", "S", "V", ""], default: "" },
    pm: { type: String, enum: ["A", "P", "E", "S", "V", ""], default: "" },
    lt: { type: String, enum: ["A", "P", "E", "S", "V", ""], default: "" },
  },
  { _id: false },
);

const payrollTimesheetEntrySchema = new mongoose.Schema({
 payPeriod: {
    type: mongoose.Types.ObjectId,
    ref: "PayPeriod",
    index: true,
  },
  employeeName: {
    type: String,
    required:true
  },
  employeePosition:{
    type: String,
    enum:["Driver","Aide"]
  },
  employeeId:{
    type:mongoose.Types.ObjectId,
    ref:"Employee",
    required:true
  },
  payrollData: {
    type: Map,
    of: dayEntrySchema,
    default: () => new Map(),
  },
  totalShifts:{
    type:Number,
    default:0
  },
  totalDays: {
    type: Number,
    default: 0,
  },
  payRate: {
    type: Number,
    required: true,
  },
  cash: {
    type: Number,
    default:0
  },
  payroll: {
    type: Number,
    default:0
  },
  total: {
    type: Number,
    default:0
  },
  notes: {
    type: String,
  },
},{timestamps:true});

module.exports = mongoose.model("PayrollTimesheetEntry", payrollTimesheetEntrySchema);
