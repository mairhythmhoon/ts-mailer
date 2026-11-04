import * as fs from "fs";

function maskText(text: string | null | undefined, visibleStart = 2, visibleEnd = 2): string {
  if (!text) {
    return text as string;
  }

  const str = String(text);

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

const DATA_FILE = "Data/data.json";

// Read data.json
const raw = fs.readFileSync(DATA_FILE, "utf-8");
const data: Record<string, unknown>[] = JSON.parse(raw);

// Mask sensitive fields
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
    const birthdate = String(record["Birthdate"]).trim();

    let year: string;
    if (birthdate.includes("/")) {
      year = birthdate.split("/").pop()!;
    } else if (birthdate.includes("-")) {
      year = birthdate.split("-")[0]; // Handles YYYY-MM-DD
    } else {
      year = "****";
    }

    record["Birthdate"] = `**/**/${year}`;
  }
}

// Overwrite the same file
fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), "utf-8");

console.log(`${DATA_FILE} has been masked successfully.`);