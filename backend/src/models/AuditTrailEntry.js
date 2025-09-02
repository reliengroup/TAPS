const mongoose = require("mongoose");

const changeSetSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: undefined },
    after: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const auditTrailEntrySchema = new mongoose.Schema(
  {
    // NEW: what entity is being audited?
    targetType: {
      type: String,
      enum: ["TimesheetEntry", "Employee"],
      required: true,
    },

    // NEW: the entity id (TimesheetEntry._id OR Employee._id)
    targetId: {
      type: mongoose.Types.ObjectId,
      required: true,
      index: true,
    },

    // TimesheetEntry-specific (kept for backward compatibility)
    timesheetEntry: {
      type: mongoose.Types.ObjectId,
      ref: "PayrollTimesheetEntry",
    },
    payPeriod: {
      type: mongoose.Types.ObjectId,
      ref: "PayPeriod",
    },
    changeDetails: {
      fieldName: {
        type: String,
        enum: ["am", "mid", "pm", "lt"],
      },
      fieldValue: {
        type: String,
        enum: ["A", "P", "E", "S", "V", ""],
      },
    },
    timesheetEntryDetails: {
      totalDays: Number,
      total: Number,
    },

    // Employee-specific
    // Basic employee identity (helpful for both targets)
    employeeDetails: {
      name: { type: String },
      id: { type: String }, // keep string for consistency with existing data
    },

    // NEW: operation + change set when targetType === 'Employee'
    operation: {
      type: String,
      enum: ["create", "update", "delete"],
      required: true,
    },
    employeeChangeSet: [changeSetSchema], // only used for employee updates

    // Actor
    userName: { type: String, required: true },
    userId: { type: mongoose.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditTrailEntry", auditTrailEntrySchema);

