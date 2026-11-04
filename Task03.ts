// Developed By github.com/@mairhythmhoon
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ZipArchive } from "@archiver/archiver";
import {
  info,
  error,
  loadTemplate,
  EMAIL_SHEET_DATA,
  recordWorkerRun,
  WORKER_RUN_SHEET_DATA,
  recordsOfEmailSended,
} from "./service";
import { appendToSheet, sendMail } from "./Module";
export const BASE_DIR = path.dirname(path.resolve(__dirname));

const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

let TEMPLATE_LOG: string | null = null;

function success(msg: string): void {
  console.log(`${GREEN}${msg}${RESET}`);
}

function initLogTemplate(): void {
  TEMPLATE_LOG = loadTemplate("log_template.html"); // INFERRED filename — VERIFY
  if (!TEMPLATE_LOG) {
    error("\n>> Log report HTML template is not loaded.");
  }
}

const LOG_FOLDER = path.join(BASE_DIR, "Logs");

function monthName(d: Date): string {
  return d.toLocaleString("en-US", { month: "long" });
}

function zipFilePath(month: string): string {
  return path.join(os.tmpdir(), `Log_Report-${month}.zip`);
}

async function zipLogs(month: string): Promise<string> {
  const zipPath = zipFilePath(month);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);

    // Include ONLY *.log files, recursively, preserving relative paths.
    archive.directory(LOG_FOLDER, false, (entry) => {
  if (entry.name && entry.name.endsWith(".log")) {
    return entry;
  }
  return false;
});
    archive.finalize();
  });

  info(`Logs zipped at: ${zipPath}`);
  return zipPath;
}

interface SendMailWithAttachmentArgs {
  to: string;
  subject: string;
  message: string;
  emailType: "html";
  replyTo?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
}

interface SendMailResult {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[];
}

async function sendLogReportEmail(html: string, month: string): Promise<boolean> {
  const zipPath = zipFilePath(month);
  const subject = `Monthly Log Files Report From System - ${month}`;

  try {
    const zipBuffer = await fsp.readFile(zipPath);

    const receiver = process.env.RESPONS_MAILE;
    if (!receiver) {
      throw new Error(
        "RESPONS_MAILE environment variable is not set — cannot determine report recipient"
      );
    }

    const result = await (sendMail as unknown as (
      args: SendMailWithAttachmentArgs
    ) => Promise<SendMailResult>)({
      to: `Admin <${receiver}>`,
      subject,
      message: html,
      emailType: "html",
      attachments: [
        {
          filename: `Log_Report-${month}.zip`,
          content: zipBuffer,
          contentType: "application/zip",
        },
      ],
    });

    recordsOfEmailSended(receiver, subject, result.id ?? "");
    info(`\n>> Email sent to ${receiver} | Subject: ${subject}\n`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`ERROR while sending log report email: ${msg}`);
    return false;
  }
}

async function cleanup(month: string): Promise<void> {
  const zipPath = zipFilePath(month);
  try {
    await fsp.unlink(zipPath);
    info("Temporary zip file deleted.");
  } catch (e: any) {
    if (e?.code !== "ENOENT") {
      error(`Failed to delete temporary zip file: ${e}`);
    }
  }
}

async function runEntrypoint(): Promise<void> {
  console.log("");
  info("███████╗███╗   ███╗ █████╗ ██╗██╗         ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗");
  info("██╔════╝████╗ ████║██╔══██╗██║██║         ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝");
  info("█████╗  ██╔████╔██║███████║██║██║         █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  ");
  info("██╔══╝  ██║╚██╔╝██║██╔══██║██║██║         ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  ");
  info("███████╗██║ ╚═╝ ██║██║  ██║██║███████╗    ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗");
  info("╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝    ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝");
  console.log("");

  initLogTemplate();

  const month = monthName(new Date());

  try {
    await zipLogs(month);

    if (TEMPLATE_LOG) {
      if (!TEMPLATE_LOG.includes("{month}")) {
        throw new Error("Missing placeholder in log HTML template");
      }
      const html = TEMPLATE_LOG.replaceAll("{month}", month);
      await sendLogReportEmail(html, month);
    }
  } catch (e) {
    error(`ERROR in main execution: ${e}`);
    process.exitCode = 1;
  } finally {
    await cleanup(month);

    try {
      recordWorkerRun("WORKER 3");
      await appendToSheet("Sheet-02", WORKER_RUN_SHEET_DATA);
    } catch (e) {
      error(`\n>> Module Level Error in 'Google_Sheet.ts'...${e}`);
    }
    try {
      await appendToSheet("Sheet-03", EMAIL_SHEET_DATA);
    } catch (e) {
      error(`\n>> Module Level Error in 'Google_Sheet.ts'...${e}`);
    }
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
export { runEntrypoint, zipLogs, cleanup };