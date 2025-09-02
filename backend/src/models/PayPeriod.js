const mongoose = require("mongoose")

const payPeriodSchema = new mongoose.Schema({
  startDate: {
    type:Date,
    required:true,
    unique:true
  },
  endDate:{
    type:Date,
    required:true
  },
  payDay:{
    type:Date,
  }
},{timestamps:true});

payPeriodSchema.set("autoIndex", true);

module.exports = mongoose.model("PayPeriod",payPeriodSchema);
