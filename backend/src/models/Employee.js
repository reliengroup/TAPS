const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeName: {
      type: String,
      required: true,
      maxlength: 255,
      trim: true,
      unique: true, 
    },
    position: {
      type: String,
      enum:["Driver","Aide"],
      required: true,
    },
    aid:{
      type:mongoose.Types.ObjectId,
      ref:"Employee"
    },
    amRate: { type: Number, required: true, min: 0, default: 0 },
    midRate: { type: Number, required: true, min: 0, default: 0 },
    pmRate: { type: Number, required: true, min: 0, default: 0 },
    ltRate: { type: Number, required: true, min: 0, default: 0 },
    cashSplitPercent: { type: Number, required: true, min: 0, max: 100 },
    dayIncrementValue: { type: Number, min: 0.25 },
    isActive:{type:Boolean,default:true}
  },
  { timestamps: true }
);

employeeSchema.set("autoIndex", true);

module.exports = mongoose.model("Employee", employeeSchema);
