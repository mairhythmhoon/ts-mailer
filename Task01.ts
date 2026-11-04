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
  TEMPLATE_BDAY,
  TEMPLATE_FESTIVAL,
  festivalsList,
  customEventsList,
  initService,
  recordWorkerRun,
  WORKER_RUN_SHEET_DATA,
  EMAIL_SHEET_DATA,
} from "./service";
import { getDataFromGoogleSheet, appendToSheet } from "./Module";

// TYPES
interface PersonRecord {
  Name: string;
  "Email address": string;
  Birthdate?: string; // raw "DD/MM/YYYY" from JSON
  [key: string]: unknown;
}

function formatDDMM(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function parseDDMMYYYY(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  const d = new Date(year, month - 1, day);
  // Reject rollover dates (e.g. 31/02/2026 silently becoming March)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

// add near the top, with the other helpers
function randomDelayMs(): number {
  return (Math.random() < 0.5 ? 1 : 2) * 1000; // randomly 1000ms or 2000ms
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let birthdayProcessed = false;
export async function main(): Promise<void> {
  // Tracks whether this invocation completed processing its current event.
  let eventProcessed = false;

  try {
    const now = new Date();
    const today = formatDDMM(now);

    console.log(now.toISOString());

    const dataPath = path.join(BASE_DIR, "Data", "data.json");
    const raw = await fs.readFile(dataPath, "utf-8");
    const data: PersonRecord[] = JSON.parse(raw);

    if (festivalsList.length === 0 && customEventsList.length === 0) {
      error("\n>> No Festival Today.\n");
    } else {
      info(
        `>> Today is ${
          festivalsList.length ? festivalsList[0] : customEventsList[0]
        }`
      );
    }
    // BIRTHDAY PROCESSING — RUN ONLY ONCE
       if (!birthdayProcessed) {
      let birthdayFound = false;

      for (const person of data) {
        try {
          const name = person.Name;
          const email = person["Email address"];

          let birthdate: Date | null = null;

          if (person.Birthdate) {
            birthdate = parseDDMMYYYY(person.Birthdate);

            if (birthdate === null) {
              logger.error("Date format is Corrupted", {
                person: name,
              });
              error(">> Invalid date format");
            }
          }

          if (
            birthdate &&
            formatDDMM(birthdate) === today
          ) {
            birthdayFound = true;

            info(`>> Birthday Today: ${name}`);

            if (!TEMPLATE_BDAY) {
              logger.error("Birthday HTML template is missing.");
              continue;
            }

            if (!TEMPLATE_BDAY.includes("{name}")) {
              throw new Error(
                "Missing placeholder in Birthday HTML template"
              );
            }

            if (await checkEmail(email)) {
              const html = TEMPLATE_BDAY.replaceAll("{name}", name);

              const sent = await sendEmailHtml(
                email,
                `Happy Birthday ${name}`,
                html,
                name
              );

              if (sent) {
                COUNTS.birthday++;
                COUNTS.total++;
              }
              await delay(randomDelayMs()); 
            }
          }
        } catch (e) {
          logger.error(`Birthday Error for ${person.Name}`, {
            error: e,
          });

          error(`Birthday Error for ${person.Name}: ${e}`);
        }
      }

      birthdayProcessed = true;

      if (!birthdayFound) {
        logger.info(">> No Birthdays today.");
        info(">> No Birthdays today.");
      }
    }

    // FESTIVAL / CUSTOM EVENT PROCESSING
    const currentEvent =
      festivalsList.length > 0
        ? festivalsList[0]
        : customEventsList.length > 0
          ? customEventsList[0]
          : null;

    if (currentEvent && TEMPLATE_FESTIVAL) {
      if (
        !TEMPLATE_FESTIVAL.includes("{name}") ||
        !TEMPLATE_FESTIVAL.includes("{festival}")
      ) {
        throw new Error(
          "Missing placeholder in Festival HTML template"
        );
      }

      info(`>> Processing Event: ${currentEvent}`);

      for (const person of data) {
        try {
          const name = person.Name;
          const email = person["Email address"];

          const html = TEMPLATE_FESTIVAL
            .replaceAll("{name}", name)
            .replaceAll("{festival}", currentEvent);

          if (await checkEmail(email)) {
            const sent = await sendEmailHtml(
              email,
              `Warm Wishes on ${currentEvent}`,
              html,
              name
            );

            if (sent) {
              COUNTS.festival++;
              COUNTS.total++;
            }
            await delay(randomDelayMs());
          }
        } catch (e) {
          logger.error(`Event Error for ${person.Name}`, {
            error: e,
          });

          error(`Event Error for ${person.Name}: ${e}`);
        }
      }
      eventProcessed = true;
    } else if (currentEvent && !TEMPLATE_FESTIVAL) {
      logger.error("Festival HTML template is missing.");
      error(">> Festival HTML template is missing.");
    }

  } catch (e) {
    logger.error("Exception in main execution", {
      error: e,
    });

    error(`ERROR in main Execution : ${e}`);

    process.exitCode = 1;
    return;

  } finally {
    // PROCESS NEXT EVENT
    if (eventProcessed) {
      if (festivalsList.length > 0) {
        logger.info("Festival processed. Removing current festival.");
        festivalsList.shift();

      } else if (customEventsList.length > 0) {
        logger.info("Custom event processed. Removing current event.");
        customEventsList.shift();
      }

      if (
        festivalsList.length > 0 ||
        customEventsList.length > 0
      ) {
        logger.info("Next event exists. Running main() again.");
        await main();
      } else {
        logger.info("All festivals and custom events processed.");
      }
    }
  }
}

// ENTRYPOINT
async function runEntrypoint(): Promise<void> {
  console.log("");
  info("███████╗███╗   ███╗ █████╗ ██╗██╗         ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗");
  info("██╔════╝████╗ ████║██╔══██╗██║██║         ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝");
  info("█████╗  ██╔████╔██║███████║██║██║         █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  ");
  info("██╔══╝  ██║╚██╔╝██║██╔══██║██║██║         ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  ");
  info("███████╗██║ ╚═╝ ██║██║  ██║██║███████╗    ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗");
  info("╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝    ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝");
  console.log("");

  // Explicit init — replaceAll service.py's import-time side effects
  // (env load, Calendar.main_(), custom_events fetch, template/festival load).
  await initService();
  logger.info("=========== Task 01 is Running.=============")
  info("\n>> LEVEL 01 : Fetching Data From Database ");
  try {
    await getDataFromGoogleSheet("Sheet-01");
    logger.info("Fetching Data From Database.");
  } catch (e) {
    logger.error("Module Level Error in 'Google_Sheet.ts'.", { error: e });
    error(`\n>> Module Level Error in 'Google_Sheet.ts'...${e}`);
  }
  info("\n>> LEVEL 01 IS DONE DATA IS GETING FROM DATABASE.\n");

  info("\n>> LEVEL 02 : Running Algorithm For Festival and Birthday Mail Sending Task.");
  try {
    birthdayProcessed = false;
    await main();
  } finally {
    if (COUNTS.birthday === 0 && COUNTS.failed === 0 && COUNTS.festival === 0 && COUNTS.total === 0) {
      logger.info("Nothing to add in Daily-Stats");
      info("\n>> Nothing to add in Daily-Stats");

    } else {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(
        now.getHours()
      )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const dayWiseSummary: (string | number)[][] = [
        [stamp, COUNTS.total, COUNTS.birthday, COUNTS.festival, COUNTS.failed],
      ];

      try {
        await appendToSheet("Task_01", dayWiseSummary.map((row) => row.map(String)));
        logger.info("Day-wise summary appended", { summary: dayWiseSummary });
      } catch (e) {
        logger.error("Module Level Error in 'Google_Sheet.ts'.", { error: e });
        error("\n>> Module Level Error in 'Google_Sheet.ts'...");
      }
    }

    try {
      logger.info("Recording worker run (Sheet-02).");
      recordWorkerRun("WORKER 1"); // task01 = WORKER 1, task02 = WORKER 2, task03 = WORKER 3
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
    logger.info("=========== Task 01 Stoped.=============")
    logger.info("===== EMAIL SYSTEM STOPED =====");
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