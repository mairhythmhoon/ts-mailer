// Developed By github.com/@mairhythmhoon
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { google, sheets_v4 } from "googleapis";
import { JWT } from "google-auth-library";

// Logger setup (simple console-based logger; replace with winston/pino if needed)
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  exception: (msg: string) => console.error(`[EXCEPTION] ${msg}`),
};

// Load .env (quiet suppresses dotenv's startup banner)
try {
  dotenv.config({ path: "Secure/.env", quiet: true });
} catch {
  console.log("\n>> .env File Is Not Present");
  process.exit(1);
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SERVICE_ACCOUNT_FILE = "Secure/credentials.json";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Memoized service instance so we don't rebuild the client on every call
let _service: sheets_v4.Sheets | null = null;

function getSheetsService(): sheets_v4.Sheets {
  if (_service) return _service;

  const credentials = JSON.parse(
  fs.readFileSync(SERVICE_ACCOUNT_FILE, "utf-8")
);

const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: SCOPES,
});

  _service = google.sheets({ version: "v4", auth });
  return _service;
}

export async function getDataFromGoogleSheet(
  range: string,
  outputPath: string = "Data/data.json"
): Promise<Record<string, string>[] | null> {
  try {
    const service = getSheetsService();

    const response = await service.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const values = response.data.values ?? [];

    if (values.length === 0) {
      logger.error("No data found in sheet.");
      return null;
    }

    const headers = values[0].map((h: string) => h.trim());
    const rows = values.slice(1);

    const jsonList: Record<string, string>[] = [];

    for (const row of rows) {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = i < row.length ? String(row[i]).trim() : "";
      }
      jsonList.push(obj);
    }

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(jsonList, null, 4), "utf-8");

    logger.info("Data successfully written to data.json");
    return jsonList;
  } catch (e: any) {
    if (e?.code || e?.errors) {
      logger.exception("Google Sheets API error occurred");
    } else {
      logger.exception("Unexpected error occurred");
    }
    return null;
  }
}

export async function appendToSheet(
  sheetName: string,
  rows: string[][]
): Promise<void> {
  try {
    const service = getSheetsService();

    await service.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    logger.info("Data appended successfully.");
  } catch (e: any) {
    if (e?.code || e?.errors) {
      logger.exception("Google Sheets API append error");
    } else {
      logger.exception("Unexpected error while appending data");
    }
  }
}

// Dry run
if (require.main === module) {
  (async () => {
    await getDataFromGoogleSheet("custom_events", "Data/custom_events.json");

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Enter sheet range : ", async (sheetName) => {
      await getDataFromGoogleSheet(sheetName);
      rl.close();
    });
  })();
}