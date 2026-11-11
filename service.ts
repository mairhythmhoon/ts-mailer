// Developed By github.com/@mairhythmhoon
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as dns from "dns";
import * as dotenv from "dotenv";
import { setupLogger } from "./Module";
import { main_ as runCalendarModule } from "./Module";
import { getDataFromGoogleSheet } from "./Module";
import { sendMail } from "./Module";

export const BASE_DIR = path.dirname(path.resolve(__dirname));

// COUNTERS  
export const COUNTS = {
  total: 0,
  birthday: 0,
  festival: 0,
  failed: 0,
  joining: 0,
};

// LOGGER + COLORED CONSOLE OUTPUT
export const logger = setupLogger();
  

const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

export function info(msg: string): void {
  console.log(`${YELLOW}${msg}${RESET}`);
}

export function error(msg: string): void {
  console.log(`${RED}${msg}${RESET}`);
}

function success(msg: string): void {
  console.log(`${GREEN}${msg}${RESET}`);
}

// EMAIL VALIDATION  (regex + MX lookup)
// Node has no safe sync-DNS equivalent, so this is now async (ADAPT).
const EMAIL_PATTERN = /^[\w.-]+@[\w.-]+\.\w+$/;

export async function checkEmail(emailRaw: string): Promise<boolean> {
  const email = emailRaw.trim();

  if (!EMAIL_PATTERN.test(email)) {
    error(`\nInvalid email format: ${email}`);
    return false;
  }

  const domain = email.split("@").pop()!.trim();

  try {
    await new Promise<void>((resolve, reject) => {
      dns.resolveMx(domain, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  } catch (e: any) {
    if (e?.code === "ENOTFOUND" || e?.code === "ENODATA") {
      error(`\nInvalid domain for ${email}: Domain does not exist or has no MX record.`);
      logger.error(`Invalid/No-MX domain for ${email}`, { error: e });
    } else {
      error(`\nUnknown error for ${email}: ${e}`);
      logger.error(`Unknown DNS error for ${email}`, { error: e });
    }
    return false;
  }
}

export async function sendEmailHtml(
  to: string,
  subject: string,
  htmlContent: string,
  name: string
): Promise<boolean> {
  try {
    const result = await sendMail({
      to: `${name} <${to}>`, // preserves Python's "Name <email>" To header
      subject,
      message: htmlContent,
      emailType: "html",
    });

    recordsOfEmailSended(to, subject, result.id ?? "");
    success(`\n>> Email sent to ${to} | Subject: ${subject}\n`);
    return true;
  } catch (e) {
    error(`ERROR while sending email to ${to} : ${e}`);
    logger.error(`ERROR while sending email to ${to}`, { error: e });
    COUNTS.failed += 1;
    return false;
  }
}

// TEMPLATES
// Loaded on-demand via initTemplates(), NOT at import time.
// explicitly before using TEMPLATE_BDAY / TEMPLATE_FESTIVAL.)
export let TEMPLATE_BDAY: string | null = null;
export let TEMPLATE_FESTIVAL: string | null = null;

export function loadTemplate(filename: string): string | null {
  try {
    const filePath = path.join(BASE_DIR, "Template", filename);
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    logger.error(`Error loading HTML template ${filename}`, { error: e });
    error(`Error loading HTML template ${filename}: ${e}`);
    return null;
  }
}

export function initTemplates(): void {
  TEMPLATE_BDAY = loadTemplate("Birthday_Wishing_Mail.html");
  TEMPLATE_FESTIVAL = loadTemplate("Festival_Mail.html");
}

// FESTIVAL / CUSTOM EVENT LISTS
// Also moved out of import-time into initFestivalData().
export let festivalsList: string[] = [];
export let customEventsList: string[] = [];

function formatDDMMYYYY(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function loadFestivalsForToday(jsonPath: string): string[] {
  const today = formatDDMMYYYY(new Date());
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const festivals: unknown = JSON.parse(raw);

  if (!Array.isArray(festivals)) return [];

  return festivals
    .filter(
      (f): f is { festival_name: string; date: string } =>
        !!f && typeof f === "object" && (f as any).date === today
    )
    .map((f) => f.festival_name);
}

export function initFestivalData(): void {
  try {
    festivalsList = loadFestivalsForToday(path.join(BASE_DIR, "Data", "festivals.json"));
    customEventsList = loadFestivalsForToday(path.join(BASE_DIR, "Data", "custom_events.json"));
    logger.info("Today's festivals loaded");
  } catch (e) {
    logger.error("festivals.json not found", { error: e });
    error("\n>> 'festivals.json' File Is Not Present.");
  }
}

// ACTIVITY RECORDS (fed into Google Sheets by the caller)
// CHANGED: row shape for Sheet-03.
//   RECORDS: [timestamp, receiver, subject, comment, id, threadId]
//   - `sender`/`from` removed (was always the same fixed mail address).
//   - `id` and `threadId` (from Gmail.ts's send response) appended at
//     the end.
export const EMAIL_SHEET_DATA: string[][] = [];

function nowDateTimeIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

export function recordsOfEmailSended(
  to: string,
  subject: string,
  id: string,
): void {
  EMAIL_SHEET_DATA.push([
    nowDateTimeIso(),
    to,
    subject,
    detectRunEnvironment(),
    id
  ]);
}

// WORKER RUN RECORD  (goes to Sheet-02)
// log, which task01/02/03 never actually used for anything.
// Row = [timestamp, where it ran, which worker ran]
export const WORKER_RUN_SHEET_DATA: string[][] = [];

function nowDDMMYYYYSlash(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${time}`;
}

export function detectRunEnvironment():
  | "System is running in GithubAction"
  | "System is running in Auto"
  | "Running Locally" {
  if (process.env.GITHUB_ACTIONS !== "true") {
    return "Running Locally";
  }

  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    return "System is running in GithubAction";
  }

  if (process.env.GITHUB_EVENT_NAME === "schedule") {
    return "System is running in Auto";
  }

  // fallback for other triggers (push, pull_request, etc.) if this
  // function ever runs in a workflow that isn't one of your 4 cron jobs
  return "System is running in GithubAction";
}

export function recordWorkerRun(worker: string): void {
  WORKER_RUN_SHEET_DATA.push([nowDDMMYYYYSlash(), detectRunEnvironment(), worker]);
}

// Caller (Task01.ts entrypoint) must await this once before using
// anything above that depends on env/templates/festival data.
export async function initService(): Promise<void> {
  logger.info("===== EMAIL SYSTEM STARTED =====");
  try {
    dotenv.config({ path: path.join(BASE_DIR, "Secure", ".env") });
    logger.info(".env file is loaded");
  } catch (e) {
    logger.error(".env file is not found/Exception in loading", { error: e });
    error("\n>> .env File Is Not Present");
    process.exitCode = 1;
    return;
  }

  try {
    await runCalendarModule();
    logger.info("Calendar module's main_() is running");
  } catch (e) {
    error("\n>> Module Level Error in 'Calendar.ts'...");
    logger.error("Exception in Calendar.ts", { error: e });
  }

  try {
    await getDataFromGoogleSheet("custom_events", "Data/custom_events.json");
    logger.info("custom events fetched from Google Sheet");
  } catch (e) {
    error("\n>> Module Level Error in 'Google_Sheet.ts'...");
    logger.error("Exception in Google_Sheet.ts", { error: e });
  }

  initTemplates();
  initFestivalData();
}
