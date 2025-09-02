const express = require("express");
require('dotenv').config()
const indexRouter = require("./src/routes/index");
const { notFound, errorHandler } = require("./src/utils/errorHandler");
const helmet = require("helmet");
const { sanitizeInputs } = require("./src/utils/sanitize");
const { connectDB, closeDB } = require("./src/config/db");
const cors = require("cors");

const app = express();

const allowedOrigins = [
  "https://taps.taykztyme.com", 
  "http://localhost:5173", 
  "http://taykz-payroll-frontend:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error("CORS not allowed"), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());
// Secure headers + CSP (adjust directives for your front-end needs)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],      // add CDNs if you use them
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"], // prevent clickjacking
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// Hide tech stack
app.disable("x-powered-by");

// Parse JSON
app.use(express.json());

// Sanitize all incoming inputs (body, query, params)
app.use(sanitizeInputs);

// Routes
app.use("/api", indexRouter);

// 404 + Error handlers (MUST be after routes)
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    console.log("App starting...");
    await connectDB(); // connect before starting the server
    const server = app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down...`);
      server.close(async () => {
        await closeDB();
        console.log("🛑 Server closed. Bye!");
        process.exit(0);
      });
      // force-exit fallback
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("unhandledRejection", (err) => {
      console.error("UNHANDLED REJECTION:", err);
      shutdown("unhandledRejection");
    });
    process.on("uncaughtException", (err) => {
      console.error("UNCAUGHT EXCEPTION:", err);
      shutdown("uncaughtException");
    });
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
})();
