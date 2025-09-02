const mongoose = require("mongoose");

const payPeriodDaySchema = new mongoose.Schema({
  dayName:{
    type:String,
    required:true
  },
  date:{
    type:Date,
    required:true
  },
  payPeriod:{
    type:mongoose.Types.ObjectId,
    ref:"PayPeriod"
  }
},{timestamps:true});

module.exports = mongoose.model("PayPeriodDay",payPeriodDaySchema);
