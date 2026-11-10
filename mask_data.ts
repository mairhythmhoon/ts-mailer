const fs = require("fs");
const path = require("path");

function maskText(text: string | null | undefined): string {
  if (text == null || text === "") return "";

  const str = String(text);
  const visibleStart = 2;
  const visibleEnd = 2;

  if (str.length <= visibleStart + visibleEnd) {
    return "*".repeat(str.length);
  }

  return (
    str.slice(0, visibleStart) +
    "*".repeat(str.length - visibleStart - visibleEnd) +
    str.slice(-visibleEnd)
  );
}

function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) {
    return maskText(email);
  }

  const [username, domain] = email.split("@", 2);

  let maskedUsername: string;
  if (username.length <= 2) {
    maskedUsername = "*".repeat(username.length);
  } else {
    maskedUsername = username.slice(0, 2) + "*".repeat(username.length - 2);
  }

  return `${maskedUsername}@${domain}`;
}

function maskBirthdate(value: string | null | undefined): string {
  const bd = String(value ?? "").trim();
  let year = "****";

  const m1 = bd.match(/\/(\d{4})$/); // DD/MM/YYYY
  const m2 = bd.match(/^(\d{4})-/);  // YYYY-MM-DD
  if (m1) year = m1[1];
  else if (m2) year = m2[1];

  return `**/**/${year}`;
}

const DATA_FILE = path.join(__dirname, "Data", "data.json");

const raw = fs.readFileSync(DATA_FILE, "utf-8");
const parsed = JSON.parse(raw);
if (!Array.isArray(parsed)) {
  throw new Error(`${DATA_FILE} must contain a JSON array`);
}

const data: Record<string, unknown>[] = parsed;

for (const record of data) {
  if ("Name" in record) {
    record["Name"] = maskText(record["Name"] as string);
  }
  if ("Email address" in record) {
    record["Email address"] = maskEmail(record["Email address"] as string);
  }
  if ("Responder Email Address" in record) {
    record["Responder Email Address"] = maskEmail(
      record["Responder Email Address"] as string
    );
  }
  if ("Birthdate" in record) {
    record["Birthdate"] = maskBirthdate(record["Birthdate"] as string);
  }
}

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), "utf-8");
console.log(`${DATA_FILE} has been masked successfully.`);