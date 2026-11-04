// Developed By github.com/@mairhythmhoon
import * as fs from "fs/promises";
import * as path from "path";
import {
  BASE_DIR,
  COUNTS,
  info,
  error,
  logger,
  checkEmail,
  sendEmailHtml,
  loadTemplate,
  initService,
  recordWorkerRun,
  WORKER_RUN_SHEET_DATA,
  EMAIL_SHEET_DATA,
} from "./service";
import { getDataFromGoogleSheet, appendToSheet } from "./Module";

interface PersonRecord {
  Name: string;
  "Email address": string;
  Timestamp?: string; // raw "DD/MM/YYYY HH:MM:SS" from JSON
  [key: string]: unknown;
}

interface LastRunData {
  last_timestamp?: string;
}

const LAST_RUN_FILE = path.join(BASE_DIR, "Data", "last_run.json");
const DATA_FILE = path.join(BASE_DIR, "Data", "data.json");


let TEMPLATE_JOIN: string | null = null;

function initJoinTemplate(): void {
  TEMPLATE_JOIN = loadTemplate("Thank_You_Mail.html");
  if (!TEMPLATE_JOIN) {
    logger.error("Join HTML template failed to load at startup");
    error("\n>> Join HTML template is not loaded.");
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDDMMYYYYHHmmss(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseDDMMYYYYHHmmss(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    value.trim()
  );
  if (!match) return null;

  const [, dd, mm, yyyy, HH, MM, SS] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const hour = Number(HH);
  const minute = Number(MM);
  const second = Number(SS);

  const d = new Date(year, month - 1, day, hour, minute, second);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute ||
    d.getSeconds() !== second
  ) {
    return null;
  }
  return d;
}

function randomDelayMs(): number {
  // Throttle convention from task01.ts 
  // Kept for consistency across workers. Flagging again: this changes
  return (Math.random() < 0.5 ? 1 : 2) * 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadLastRun(): Promise<Date | null> {
  try {
    const raw = await fs.readFile(LAST_RUN_FILE, "utf-8");
    const data: LastRunData = JSON.parse(raw);

    if (!data.last_timestamp) return null;

    return parseDDMMYYYYHHmmss(data.last_timestamp);
  } catch {
    // covers missing file, invalid JSON, and bad timestamp alike.
    return null;
  }
}

async function saveLastRun(timestamp: Date): Promise<void> {
  await fs.writeFile(
    LAST_RUN_FILE,
    JSON.stringify({ last_timestamp: formatDDMMYYYYHHmmss(timestamp) }),
    "utf-8"
  );
}

// ---------- MAIN WORKFLOW ----------
export async function main(): Promise<void> {
  try {
    const runTime = new Date();
    runTime.setMilliseconds(0); 

    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const data: PersonRecord[] = JSON.parse(raw);

    const lastRunTime = await loadLastRun();

    let startTime: Date;
    if (lastRunTime === null) {
      startTime = new Date(runTime.getTime() - 24 * 60 * 60 * 1000);
      await saveLastRun(runTime); // first-run checkpoint 
    } else {
      startTime = lastRunTime;
    }

    let joiningSent = false;

    for (const person of data) {
      try {
        const name = person.Name;
        const email = person["Email address"];

        if (person.Timestamp === undefined) continue;

        const joinTime = parseDDMMYYYYHHmmss(person.Timestamp);
        if (joinTime === null) {
          logger.error("Date format corrupted", { person: name });
          continue;
        }

        if (joinTime >= startTime && joinTime <= runTime) {
          info(`>> New Joiner: ${name}`);

          const joinStr = formatDDMMYYYYHHmmss(joinTime);

          if (!TEMPLATE_JOIN) {
            throw new Error("Join HTML template is not loaded");
          }
          if (
            !TEMPLATE_JOIN.includes("{name}") ||
            !TEMPLATE_JOIN.includes("{join_time_str}")
          ) {
            throw new Error("Missing placeholder in Join HTML template");
          }

          const html = TEMPLATE_JOIN.replaceAll("{name}", name)
          .replaceAll("{join_time_str}",joinStr);

          if (await checkEmail(email)) {
            // sendEmailHtml records the Sheet-03 activity row internally
            // (service.ts does this now) — do not record it again here.
            const sent = await sendEmailHtml(
              email,
              `Thank You for Joining Us, ${name}`,
              html,
              name
            );

            if (sent) {
              joiningSent = true;
              COUNTS.joining++;
              COUNTS.total++;
            }
            await delay(randomDelayMs());
          }
        }
      } catch (e) {
        logger.error(`Error for ${person.Name ?? "Unknown"}`, { error: e });
        error(`Error for ${person.Name ?? "Unknown"}: ${e}`);
      }
    }

    // Checkpoint saved unconditionally.
    await saveLastRun(runTime);

    if (!joiningSent) {
      logger.info(">> No new joiners since last run");
      info(">> No new joiners since last run");
    }
  } catch (e) {
    logger.error("Exception in main execution", { error: e });
    error(`ERROR in main execution: ${e}`);
    process.exitCode = 1;
  }
}

// ---------- ENTRYPOINT ----------
async function runEntrypoint(): Promise<void> {
  console.log("");
  info("███████╗███╗   ███╗ █████╗ ██╗██╗         ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗");
  info("██╔════╝████╗ ████║██╔══██╗██║██║         ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝");
  info("█████╗  ██╔████╔██║███████║██║██║         █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  ");
  info("██╔══╝  ██║╚██╔╝██║██╔══██║██║██║         ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  ");
  info("███████╗██║ ╚═╝ ██║██║  ██║██║███████╗    ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗");
  info("╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝    ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝");
  console.log("");

  await initService();
  initJoinTemplate();

  logger.info("=========== Task 02 is Running.=============");

  info("\n>> LEVEL 01 : Fetching Data From Database ");
  try {
    await getDataFromGoogleSheet("Sheet-01");
    logger.info("Fetching Data From Database.");
  } 
  catch (e) {
    logger.error("Module Level Error in 'Google_Sheet.ts'.", { error: e });
    error(`\n>> Module Level Error in 'Google_Sheet.ts'...${e}`);
  }
  info("\n>> LEVEL 01 IS DONE DATA IS GETTING FROM DATABASE.\n");

  info("\n>> LEVEL 02 : Running Algorithm For New Joiners Sending Mails Task.");
  const lastRunBefore = await loadLastRun();
  const formattedNow = formatDDMMYYYYHHmmss(new Date());
  info(
    `\n>> From ${lastRunBefore ? formatDDMMYYYYHHmmss(lastRunBefore) : "null"} to ${formattedNow}.`
  );

  try {
    await main();
  } 
  finally {
    if (COUNTS.failed === 0 && COUNTS.joining === 0 && COUNTS.total === 0) {
      logger.info("Nothing to add in Daily-Stats");
      info("\n>> Nothing to add in Daily-Stats");
    } else {
      const now = new Date();
      const stamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(
        now.getHours()
      )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const dayWiseSummary: (string | number)[][] = [
        [stamp, COUNTS.total, COUNTS.joining, COUNTS.failed],
      ];

      try {
        await appendToSheet("Task_02", dayWiseSummary.map((row) => row.map(String)));
        logger.info("Day-wise summary appended", { summary: dayWiseSummary });
      } catch (e) {
        logger.error("Module Level Error in 'Google_Sheet.ts'.", { error: e });
        error("\n>> Module Level Error in 'Google_Sheet.ts'...");
      }
    }

    try {
      logger.info("Recording worker run (Sheet-02).");
      recordWorkerRun("WORKER 2"); // task01 = WORKER 1, task02 = WORKER 2, task03 = WORKER 3
      await appendToSheet("Sheet-02", WORKER_RUN_SHEET_DATA);
    } catch (e) {
      logger.error("Module Level Error in 'Google_Sheet.ts'.", { error: e });
      error(`\n>> Module Level Error in 'Google_Sheet.ts'...${e}`);
    }

    try {
      logger.info("Adding Email Send Data.");
      await appendToSheet("Sheet-03", EMAIL_SHEET_DATA);
    } catch (e) {
      logger.error("Module Level Error in 'Google_Sheet.ts'.", { error: e });
      error(`\n>> Module Level Error in 'Google_Sheet.ts'...${e}`);
    }

    logger.info("=========== Task 02 Stopped.=============");
    logger.info("===== EMAIL SYSTEM STOPPED =====");
    info("███████╗███╗   ██╗██████╗      ██████╗ ███████╗    ██████╗ ██████╗  ██████╗  ██████╗ ██████╗  █████╗ ███╗   ███╗");
    info("██╔════╝████╗  ██║██╔══██╗    ██╔═══██╗██╔════╝    ██╔══██╗██╔══██╗██╔═══██╗██╔════╝ ██╔══██╗██╔══██╗████╗ ████║");
    info("█████╗  ██╔██╗ ██║██║  ██║    ██║   ██║█████╗      ██████╔╝██████╔╝██║   ██║██║  ███╗██████╔╝███████║██╔████╔██║");
    info("██╔══╝  ██║╚██╗██║██║  ██║    ██║   ██║██╔══╝      ██╔═══╝ ██╔══██╗██║   ██║██║   ██║██╔══██╗██╔══██║██║╚██╔╝██║");
    info("███████╗██║ ╚████║██████╔╝    ╚██████╔╝██║         ██║     ██║  ██║╚██████╔╝╚██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║");
    info("╚══════╝╚═╝  ╚═══╝╚═════╝      ╚═════╝ ╚═╝         ╚═╝     ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝");
  }
}

if (require.main === module) {
  runEntrypoint();
}
export { runEntrypoint };