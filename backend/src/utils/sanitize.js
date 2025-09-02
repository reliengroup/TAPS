
const sanitizeHtml = require("sanitize-html");

function deepSanitize(val) {
  if (typeof val === "string") {
    // Strip all tags/attrs to kill script payloads
    return sanitizeHtml(val, { allowedTags: [], allowedAttributes: {} });
  }
  if (Array.isArray(val)) return val.map(deepSanitize);
  if (val && typeof val === "object") {
    for (const k of Object.keys(val)) val[k] = deepSanitize(val[k]);
    return val;
  }
  return val;
}

function sanitizeInputs(req, _res, next) {
  if (req.body) req.body = deepSanitize(req.body);
  if (req.query) req.query = deepSanitize(req.query);
  if (req.params) req.params = deepSanitize(req.params);
  next();
}

module.exports = { sanitizeInputs };
