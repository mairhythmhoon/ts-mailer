<div align="center">

# ✉️ ts-mailer

### A TypeScript-powered email automation service for Gmail and Google Sheets

Automate birthday wishes, festival greetings, new-joiner emails, and monthly log reports—with Google Sheets as the data source and an audit trail.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs)](https://nodejs.org/)
[![Gmail API](https://img.shields.io/badge/Google-Gmail%20API-red?logo=gmail)](https://developers.google.com/gmail/api)
[![Google Sheets API](https://img.shields.io/badge/Google-Sheets%20API-34A853?logo=googlesheets)](https://developers.google.com/sheets/api)

</div>

---

## ✨ What it does

`ts-mailer` is a personal backend service that runs scheduled email workflows. It reads contacts and event data from Google Sheets, prepares HTML messages from templates, sends mail through the Gmail API, and writes activity and run summaries back to Sheets.

- 🎂 **Birthday messages** using a customizable HTML template.
- 🎉 **Festival and custom-event greetings**, with festival dates refreshed from public Hindu and Indian holiday calendars.
- 👋 **New-joiner thank-you emails**, sent for records added since the previous run.
- 📊 **Google Sheets integration** for source data, event data, worker history, delivery records, and task summaries.
- 📦 **Monthly log reports** that bundle `.log` files into a ZIP attachment and email the report.
- 🧾 **Local logs and checkpoints** to help track activity and resume the new-joiner time window.
- 🤖 **GitHub Actions automation** with scheduled and manually triggered workflows.

> **Please note:** This project can send real emails to real recipients. Configure it with your own test spreadsheet and test addresses first. Do not run it against a contact list unless you have permission to email those people.

---

## 🧭 How it works

```text
Google Sheets ──(service account)──▶ local JSON data ──▶ task workflow
                                                           │
HTML templates ◀─-─────────────────────────────────────────┤
                                                           ▼
Gmail API ◀──(OAuth 2.0 user authorization)──────── rendered email
                                                           │
                                                           ▼
                             send/run summaries ──▶ Google Sheets
```

1. A task starts and loads configuration from `Secure/.env`.
2. The Sheets module authenticates as a Google **service account**, reads a configured sheet range, and can write results back to the spreadsheet.
3. Task 01 or Task 02 prepares emails from the records and HTML templates. Task 03 packages log files for its monthly report.
4. The Gmail module builds a MIME message and sends it through the Gmail API using an OAuth 2.0 token for the Gmail account.
5. The task records worker and email activity in configured spreadsheet tabs. Task 02 also maintains `Data/last_run.json` as its time-window checkpoint.

**There are two separate Google identities/credentials:** the Sheets service account accesses the spreadsheet you share with it, while the Gmail OAuth user is the account that sends the email. They can be associated with the same Google account, but do not have to be.

---

## 🧰 Working tree

```text
ts-mailer/
├── .github/workflows/       # Scheduled and manually triggered GitHub Actions
├── Data/
│   ├── data.json            # Local contact data downloaded from the spreadsheet
│   ├── festivals.json       # Calendar-derived festival dates
│   ├── custom_events.json   # Custom events downloaded from Sheets
│   └── last_run.json        # Task 02 checkpoint for new-joiner processing
├── Logs/                    # system.log and error.log (created by the logger)
├── Module/
│   ├── Calendar.ts          # Fetches and parses public holiday calendars
│   ├── Gmail.ts             # Gmail API OAuth client and MIME message sender
│   ├── Google_Sheet.ts      # Google Sheets API reads and appends
│   └── logs.ts              # Winston file and development console logging
├── Secure/                  # LOCAL ONLY: credentials and .env (gitignored)
├── Template/
│   ├── Birthday_Wishing_Mail.html
│   ├── Festival_Mail.html
│   ├── Thank_You_Mail.html
│   └── log_template.html
├── Task01.ts                # Birthday and festival/custom-event messages
├── Task02.ts                # New-joiner messages
├── Task03.ts                # Monthly ZIP log report
├── mask_data.ts             # Masks personal data in Data/data.json
├── service.ts               # Shared setup, validation, templates and counters
├── package.json
└── tsconfig.json
```

`Secure/`, `node_modules/`, and `.dist/` are excluded from Git. Keep credentials and OAuth tokens private; never commit them.

---

## ✅ Requirements

- Node.js **24** (the GitHub Actions workflows use Node 24).
- npm.
- A Google account with Gmail and Google Sheets access.
- A Google Cloud project with the Gmail and Sheets APIs enabled.
- A spreadsheet and its ID, plus OAuth client credentials, a Gmail OAuth token, and a Sheets service-account key.

---

## 🚀 Run locally

```bash
git clone https://github.com/mairhythmhoon/ts-mailer.git
cd ts-mailer
npm ci
npm run build
```

Create `Secure/` and add the configuration and credential files described below.

Once Google authorization and your test sheet are ready, run one workflow at a time:

```bash
npm run task01   # birthdays + festivals/custom events
npm run task02   # new joiners since the last checkpoint
npm run task03   # ZIP and email the log report
```

The scripts compile TypeScript into `.dist/` before running. Task 01 and Task 02 use live contact data and can send to every matching record; verify your sheet and recipients before invoking them.

---

## 🔐 Configure Google APIs for your account

### 1. Create a Google Cloud project and enable APIs

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. In **APIs & Services → Library**, enable **Gmail API** and **Google Sheets API**.
3. Configure the OAuth consent screen for the project. If the app is in testing mode, add the Google account that will send email as a test user. Follow Google's current verification and publishing requirements for your account and use case.

### 2. Set up Gmail OAuth (the sending account)

The Gmail module uses OAuth 2.0 with the `https://www.googleapis.com/auth/gmail.send` scope.

It loads these files:

- `Secure/gmail-credentials.json` — OAuth client credentials downloaded from Google Cloud. The code accepts the `installed` or `web` OAuth client JSON format.
- `Secure/gmail-token.json` — an authorized user's OAuth token, including a refresh token where issued.

Create an OAuth client in **Google Cloud Console → APIs & Services → Credentials**.

Choose a client type that matches the authorization flow you use (a desktop app is commonly suitable for local development), then save the downloaded JSON as `Secure/gmail-credentials.json`.

**A token must be authorized for the same Gmail account that should send the mail and include the Gmail send scope.**

This repository expects the token file to already exist; it does not provide an interactive first-time OAuth authorization command. Complete Google's OAuth consent flow with a trusted local OAuth tool or a small, reviewed one-time authorization helper, then save the resulting token as `Secure/gmail-token.json`.

Do not paste credentials or tokens into source code, issues, or chat.

The application writes refreshed token values back to this file when Google returns them, so the file must be writable and kept secret.

Set `E_MAIL` to the sending address for your account. Gmail must permit that account to send using the configured From address.

### 3. Set up Google Sheets access (service account)

1. In Google Cloud, create a service account and create/download a JSON key. Store it as `Secure/credentials.json`.
2. Open that JSON and copy the service account's `client_email` value.
3. Share your spreadsheet with that service-account email address and grant the access needed by your workflows. Reading requires viewer access; appending rows requires edit access.
4. Copy the spreadsheet ID from its URL. For a URL like `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`, the ID is the part between `/d/` and `/edit`.
5. Configure the required sheet names/ranges and headers in your spreadsheet.

The application reads the first row as headers and turns subsequent rows into JSON objects.

The code refers to ranges/tabs such as `Sheet-01`, `custom_events`, `Sheet-02`, `Sheet-03`, `Task_01`, and `Task_02`; use matching names and adapt the task or configuration if your sheet layout differs.

The Sheets client uses the `https://www.googleapis.com/auth/spreadsheets` scope and the service-account key; it does not use the Gmail OAuth token.

### 4. Create `Secure/.env`

Create `Secure/.env` with the values consumed by the application:

```dotenv
SPREADSHEET_ID=your_google_spreadsheet_id

E_MAIL=your-sender@gmail.com

RESPONS_MAILE=your-reply-to-or-report-recipient@example.com
```

- `SPREADSHEET_ID` identifies the spreadsheet.
- `E_MAIL` is used as the From address.
- `RESPONS_MAILE` is used for Reply-To and by Task 03 as the log-report recipient.

The variable name `RESPONS_MAILE` is intentionally shown exactly as used by the code.

### 5. Confirm the spreadsheet data and templates

- Task 01 expects contact headers including `Name`, `Email address`, and optionally `Birthdate` in `DD/MM/YYYY` format.
- Task 02 expects `Name`, `Email address`, and a `Timestamp` in `DD/MM/YYYY HH:MM:SS` format.
- `custom_events` is fetched to `Data/custom_events.json`; event dates are compared as `DD-MM-YYYY`.
- Customize the HTML files in `Template/`.

Keep the placeholders used by the task:

| Template | Placeholders |
|---|---|
| Birthday | `{name}` |
| Festival | `{name}`, `{festival}` |
| Thank You | `{name}` |
| Log Report | `{month}` |

---

## ⚙️ GitHub Actions

The repository includes these workflows:

| Workflow | Purpose | Schedule in the workflow file | Manual run |
|---|---|---|---|
| `fest_bday.yml` | Task 01: birthday and festival/custom-event emails | Daily at 08:00 IST | Yes |
| `new_joiner.yml` | Task 02: new-joiner emails | 06:00, 10:00, 14:00, and 18:00 IST | Yes |
| `log_sender.yml` | Task 03: send a ZIP log report | No schedule; manually dispatched | Yes |
| `log_cleanup.yml` | Trigger log report, then keep the latest 10 lines in log files | Monthly on day 1 at 07:30 IST | Yes |

GitHub Actions cron schedules are expressed in UTC. The times above are converted from the cron definitions in the workflow files; scheduled runs can be delayed by GitHub.

### Configure GitHub Actions

To run these workflows in your own repository:

1. Add the repository **Actions secrets** listed below.
2. Ensure the spreadsheet is shared with the service-account email in `credentials.json`.
3. Review workflow permissions, especially workflows that commit and push changes to the repository.
4. Open **Actions**, select a workflow, and choose **Run workflow** to test manually.

### Required GitHub Actions secrets

| GitHub Actions secret | Contents |
|---|---|
| `ENV_FILE` | Full contents of `Secure/.env` |
| `CREDENTIALS_JSON` | Full service-account key JSON for Sheets |
| `GMAIL_CREDENTIALS_JSON` | Full Gmail OAuth client JSON |
| `GMAIL_TOKEN_JSON` | Full authorized Gmail token JSON |

These are materialized as files under `Secure/` during workflow runs.

Restrict access to repository secrets, rotate credentials if exposed, and never print their values in workflow logs.

---

## 🗂️ Data and logs

- `Data/data.json` is generated from the spreadsheet by the Sheets reader and contains personal data. Treat it as sensitive.
- `Data/last_run.json` stores the Task 02 checkpoint. A missing or invalid checkpoint makes the first run use a recent 24-hour window, then updates the checkpoint.
- `Logs/system.log` records informational activity; `Logs/error.log` contains errors. The logger creates the `Logs/` directory as needed.
- Task 03 archives `.log` files recursively and emails the ZIP to `RESPONS_MAILE`; its temporary archive is cleaned up afterward.
- `mask_data.ts` masks selected fields in `Data/data.json`. It **overwrites the file**, so keep a backup and do not treat masking as a substitute for protecting the original data.

---

## 🧪 Available npm scripts

| Command | What it does |
|---|---|
| `npm run build` | Compiles TypeScript into `.dist/` |
| `npm run task01` | Builds and runs the birthday/festival task |
| `npm run task02` | Builds and runs the new-joiner task |
| `npm run task03` | Builds and runs the log-report task |

---

## 💡 Interesting details

- Festival dates are fetched from two public Google holiday calendars, merged to remove duplicate festival/date pairs, and sorted chronologically.
- Birthday mail is processed once per Task 01 run; event greetings can process multiple events in sequence.
- Email validation checks the address format and looks up the domain's MX record before sending.
- The Gmail module creates MIME messages itself and supports text or HTML, CC/BCC, and attachments.
- The application records Gmail message IDs with its email activity, making it easier to correlate a send with the Gmail response.
- Task 02's checkpoint-based window helps it find newly joined records instead of resending a thank-you to every contact on every run.

---

## 🛠️ Troubleshooting

| Symptom | Things to check |
|---|---|
| Missing credentials or `.env` errors | Confirm the exact filenames and that the task is run from the project root; local files belong under `Secure/`. |
| Sheets permission or API errors | Confirm Sheets API is enabled, `SPREADSHEET_ID` is correct, the service-account JSON is valid, and the spreadsheet is shared with its `client_email`. |
| Gmail authorization/token error | Confirm Gmail API is enabled, OAuth client JSON is in the accepted format, the token exists and has Gmail send permission, and the token belongs to the intended sender. Reauthorize if it is revoked or expired. |
| No contacts/events are processed | Check the sheet tab/range names, header spelling, expected date formats, local timezone, and whether event dates match today. |
| Emails are not sent | Check `Logs/error.log`, recipient addresses, DNS/MX lookup access, Gmail API/account limits, and OAuth consent/test-user settings. |
| Workflow cannot write repository changes | Check workflow `contents: write` permission and repository/branch protection rules. |

---

## 🤝 Contributing

Contributions are welcome! If you have ideas, bug fixes, or improvements, feel free to contribute.

### How to contribute

1. **Fork** the repository.
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`).
3. **Commit** your changes (`git commit -m 'Add AmazingFeature'`).
4. **Push** to your branch (`git push origin feature/AmazingFeature`).
5. **Open** a Pull Request describing your changes.

### Areas for contribution

- 📧 Additional email templates and notification workflows.
- 🎨 Enhanced HTML email designs.
- 🌍 Internationalization and multi-language support.
- ⚡ Performance and reliability improvements.
- 📊 Enhanced Google Sheets integration and reporting.
- 🧪 Automated testing and error handling.
- 🔧 Improved scheduling and workflow management.

---

## 📚 Documentation

### Module Details

**`Module/Gmail.ts`** – Gmail integration module

- Gmail API integration using OAuth 2.0.
- MIME email message construction.
- HTML and plain-text email support.
- CC, BCC, Reply-To, and attachments.
- Gmail message ID tracking.

**`Module/Google_Sheet.ts`** – Google Sheets integration

- Google Sheets API integration using a service account.
- Spreadsheet data retrieval and synchronization.
- Appending worker activity and email records.
- Task execution summaries.

**`Module/Calendar.ts`** – Festival calendar module

- Fetches public Hindu and Indian holiday calendars.
- Parses festival dates and event information.
- Merges calendar data and removes duplicate entries.
- Maintains chronological festival records.

**`Module/logs.ts`** – Logging module

- Winston-based logging.
- Informational and error log management.
- Local log file generation.
- Development console logging.

**`service.ts`** – Shared service module

- Common task initialization and configuration.
- Environment and configuration validation.
- HTML template loading and processing.
- Shared counters and task utilities.

### Task Details

**`Task01.ts`** – Birthday and festival automation

- Birthday detection and personalized greetings.
- Festival and custom-event notifications.
- Multiple event processing.
- Google Sheets activity synchronization.

**`Task02.ts`** – New-joiner automation

- Detects newly added contact records.
- Sends personalized thank-you emails.
- Uses timestamp-based processing.
- Maintains a checkpoint to avoid repeatedly processing old records.

**`Task03.ts`** – Monthly log reporting

- Collects application log files.
- Generates a ZIP archive.
- Sends monthly reports through Gmail.
- Cleans up temporary archive files.

---

## 📞 Contact & Support

### Get in Touch

- **GitHub:** [@mairhythmhoon](https://github.com/mairhythmhoon)
- **Email:** [rhythm.work.id@proton.me](mailto:rhythm.work.id@proton.me)
- **Instagram:** [@mairhythmhoon](https://instagram.com/mairhythmhoon)
- **LinkedIn:** [@mairhythmhoon](https://linkedin.com/in/mairhythmhoon)

For bug reports, feature requests, or technical discussions, feel free to open an issue in the repository.

---

## 💡 Future Enhancements

Potential improvements planned for future versions:

- Advanced scheduling with configurable cron expressions.
- Multi-language email template support.
- User preference and notification management.
- Automated email list segmentation.
- Improved retry mechanisms and failure recovery.
- Enhanced email delivery and execution analytics.
- More configurable automation workflows.
- Expanded automated testing and validation.

---

## 📄 License

This project is open source and distributed under the **ISC License**.

See the [LICENSE](LICENSE) file in the repository for the complete license terms.

---

<div align="center">

### ⭐ Support the Project

---
If you find this project useful, please consider giving it a **star ⭐** on GitHub.

Your support helps the project grow and encourages further development.

**Built with ❤️ using TypeScript, Gmail API, and Google Sheets by [mairhythmhoon](https://github.com/mairhythmhoon)**

</div>

---