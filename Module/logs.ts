// Developed By github.com/@mairhythmhoon

import * as fs from "fs";
import * as path from "path";
import winston from "winston";

const BASE_DIR = path.dirname(
  path.dirname(path.resolve(__dirname))
);

const LOG_DIR = path.join(BASE_DIR, "Logs");

// Create Logs folder if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Capture original caller filename and line number
function getCallerLocation(): string {
  const stack = new Error().stack;

  if (!stack) return "unknown";

  const lines = stack.split("\n").slice(1);

  for (const line of lines) {
    // Match standard Node.js stack frames
    const match =
      line.match(/\((.*):(\d+):(\d+)\)$/) ||
      line.match(/^\s*at\s+(.*):(\d+):(\d+)$/);

    if (!match) continue;

    const filePath = match[1];
    const file = path.basename(filePath);

    // Skip logger internals and dependencies
    if (
      file === "logs.js" ||
      file === "logs.ts" ||
      filePath.includes("/node_modules/")
    ) {
      continue;
    }

    return `${file}:${match[2]}`;
  }

  return "unknown";
}

export function setupLogger(): winston.Logger {

  // Common log format
  const fileFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.splat(),

    winston.format.timestamp({
      format: "DD-MM-YYYY HH:mm:ss",
    }),

    winston.format.printf((info) => {
      const {
        timestamp,
        level,
        message,
        stack,
        location,
      } = info;

      const padded = String(level).toUpperCase().padEnd(8);

      const caller =
        typeof location === "string"
          ? location
          : "unknown";

      const msg =
        stack && level === "error"
          ? `${message}\n${stack}`
          : message;

      return `${timestamp} | ${padded} | ${caller} | ${msg}`;
    })
  );

  // SYSTEM LOG: INFO and above
  const systemTransport = new winston.transports.File({
    filename: path.join(LOG_DIR, "system.log"),
    level: "info",
    format: fileFormat,
  });

  // ERROR LOG: ERROR and above
  const errorTransport = new winston.transports.File({
    filename: path.join(LOG_DIR, "error.log"),
    level: "error",
    format: fileFormat,
  });

  // Create logger
  const logger = winston.createLogger({
    level: "debug",
    transports: [
      systemTransport,
      errorTransport,
    ],
  });

  // Wrap logging methods to capture original caller
  const levels = [
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
] as const;

for (const level of levels) {
  const original: (...args: any[]) => any =
    (logger[level] as any).bind(logger);

  (logger as any)[level] = (...args: any[]) => {
    const location = getCallerLocation();

    if (typeof args[0] === "object" && args[0] !== null) {
      args[0] = { ...args[0], location };
    } else if (
      typeof args[1] === "object" &&
      args[1] !== null &&
      !Array.isArray(args[1])
    ) {
      args[1] = { ...args[1], location };
    } else {
      args.push({ location });
    }

    return original(...args);
  };
}

  // Console output in development
  if (process.env.NODE_ENV !== "production") {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),

          winston.format.timestamp({
            format: "DD-MM-YYYY HH:mm:ss",
          }),

          winston.format.printf(({ timestamp, level, message, location }) => {
            return `${timestamp} | ${level} | ${location || "unknown"} | ${message}`;
          })
        ),
      })
    );
  }

  return logger;
}

// Example usage
if (require.main === module) {
  const logger = setupLogger();

  logger.info("Logger started");
  logger.warn("This is a warning");

  logger.error("Test error", {
    stack: new Error("Test error").stack,
  });
}