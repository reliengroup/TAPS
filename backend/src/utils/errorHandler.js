
// src/middleware/errorHandler.js
// 404 handler
function notFound(req, res, next) {
  const err = new Error(`Not Found - ${req.originalUrl}`);
  err.status = 404;
  next(err);
}

// Global error handler
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err); // let Express handle it
  console.error(err)
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  const body = {
    message,
  };

  // Extra debug info in non-production
  if (process.env.NODE_ENV !== "production") {
    body.stack = err.stack;
    body.method = req.method;
    body.path = req.originalUrl;
  }

  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
