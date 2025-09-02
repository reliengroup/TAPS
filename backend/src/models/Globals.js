const mongoose = require("mongoose");

const globalsSchema = new mongoose.Schema({
  currentPayPeriod: { type: mongoose.Types.ObjectId, ref: "PayPeriod", default: null },
  autoCreatePayPeriods: { type: Boolean, default: false },
}, { strict: true });


module.exports = mongoose.model("Globals", globalsSchema);
 
