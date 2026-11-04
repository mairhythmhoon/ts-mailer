  // Developed By github.com/@mairhythmhoon
  import fs from "fs";
  import { google } from "googleapis";
  import * as dotenv from "dotenv";
  import { OAuth2Client } from "google-auth-library";
  import MailComposer from "nodemailer/lib/mail-composer";

  // CONFIGURATION
  const FROM = process.env.E_MAIL;
  const REPLY_TO = process.env.RESPONS_MAILE;

  const FOOTER = 'This email was sent automatically with ';

  const CREDENTIALS_PATH = "Secure/gmail-credentials.json";
  const TOKEN_PATH = "Secure/gmail-token.json";

  const SCOPES = [
    "https://www.googleapis.com/auth/gmail.send"
  ];

  // TYPES
  export interface MailAttachment {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }

  export interface SendMailInput {
    to: string | string[];
    subject: string;
    message: string;
    emailType?: 'text' | 'html';
    cc?: string | string[];
    bcc?: string | string[];
    attachments?: MailAttachment[];
  }

  interface SendMailResult {
    id?: string | null;
    threadId?: string | null;
    labelIds?: string[];
  }

  // OAUTH2 AUTHORIZATION
  function authorize(): OAuth2Client {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error(
        `Credentials file not found: ${CREDENTIALS_PATH}`
      );
    }

    const credentials = JSON.parse(
      fs.readFileSync(CREDENTIALS_PATH, "utf-8")
    );

    const config =
      credentials.installed || credentials.web;

    if (!config) {
      throw new Error(
        "Invalid OAuth credentials.json format."
      );
    }

    return new google.auth.OAuth2(
      config.client_id,
      config.client_secret,
      config.redirect_uris?.[0]
    );
  }

  // GET AUTHENTICATED OAUTH CLIENT
  async function getOAuthClient(): Promise<OAuth2Client> {
    const oauth2Client = authorize();

    if (!fs.existsSync(TOKEN_PATH)) {
      throw new Error(
        "token.json not found. Complete OAuth authorization first."
      );
    }

    const token = JSON.parse(
      fs.readFileSync(TOKEN_PATH, "utf-8")
    );

    oauth2Client.setCredentials(token);

    oauth2Client.on("tokens", (newTokens) => {
      const updatedToken = {
        ...oauth2Client.credentials,
        ...newTokens
      };

      fs.writeFileSync(
        TOKEN_PATH,
        JSON.stringify(updatedToken, null, 2)
      );
    });

    return oauth2Client;
  }

  // PREPARE EMAIL BODY
  function prepareEmailBody(input: SendMailInput): {
    html?: string;
    text?: string;
  } {
    const emailType = input.emailType ?? 'text';

    if (emailType === 'html') {
      const footer = `---
                      <br>
                        <em>
                          ${FOOTER}<a href="https://github.com/mairhythmhoon/ts-mailer"><strong>ts-mailer.</strong></a>
                            <br>
                            <br>
                              Service Provider:
                              <a href="https://www.instagram.com/mairhythmhoon">@mairhythmhoon</a>
                              <br>
                              GitHub:
                              <a href="https://github.com/mairhythmhoon">mairhythmhoon</a>
                              <br>
                        </em>
                    `;

      // Insert footer before closing body tag when present.
      const html = /<\/body>/i.test(input.message)
        ? input.message.replace(/<\/body>/i, `${footer}</body>`)
        : `${input.message}${footer}`;

      return { html };
    }

    const footer = `


  ---
  ${FOOTER}ts-mailer
  https://github.com/mairhythmhoon/ts-mailer

  Service Provider: @mairhythmhoon
  https://www.instagram.com/mairhythmhoon

  GitHub: mairhythmhoon
  https://github.com/mairhythmhoon`;

    return {
      text: `${input.message}${footer}`
    };
  }

  // ENCODE EMAIL INTO BASE64URL MIME
  async function encodeEmail(
    input: SendMailInput
  ): Promise<string> {

    const body = prepareEmailBody(input);

    const mailOptions = {
      from: FROM,
      to: input.to,
      replyTo: REPLY_TO,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,

      // Only one email format is generated.
      ...(body.html !== undefined
        ? { html: body.html }
        : { text: body.text }),

      attachments: (input.attachments || []).map(
        (attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType
        })
      ),

      disableFileAccess: true,
      disableUrlAccess: true
    };

    const mail = new MailComposer(mailOptions).compile();

    const message = await new Promise<Buffer>(
      (resolve, reject) => {
        mail.build((error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        });
      }
    );

    return message
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  // ERROR HANDLING
  function handleGmailError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`Gmail API Error: ${error.message}`);
    }

    return new Error(
      `Unknown Gmail API error: ${String(error)}`
    );
  }

  // PUBLIC SEND MAIL FUNCTION
  export async function sendMail(
    input: SendMailInput
  ): Promise<SendMailResult> {
    try {
      // Validate input
      if (!input.to || (
        Array.isArray(input.to) && input.to.length === 0
      )) {
        throw new Error("Recipient (to) is required.");
      }

      if (!input.subject?.trim()) {
        throw new Error("Email subject is required.");
      }

      if (!input.message?.trim()) {
        throw new Error("Email message is required.");
      }

      if (
        input.emailType !== undefined &&
        !['text', 'html'].includes(input.emailType)
      ) {
        throw new Error("Invalid emailType. Use 'text' or 'html'.");
      }

      // Authenticate
      const auth = await getOAuthClient();

      // Initialize Gmail API
      const gmail = google.gmail({
        version: "v1",
        auth
      });

      // Generate MIME message
      const raw = await encodeEmail(input);

      // Send email through Gmail API
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw
        }
      });

      return {
        id: response.data.id,
        threadId: response.data.threadId,
        labelIds: response.data.labelIds || []
      };

    } catch (error) {
      throw handleGmailError(error);
    }
  }

  // DRY RUN
  async function dryRun(): Promise<void> {
    try {
      const result = await sendMail({
        to: "ai.pridham09@gmail.com",
        subject: "Gmail Module - Plain Text Test",

        emailType: "html",

        message: `<h1>helo this html mail from Rhythm</h1>`
      });

      console.log("Email sent successfully:");
      console.log(result);

    } catch (error) {
      console.error("Dry run failed:", error);
    }
  }

  if (require.main === module) {
    dryRun();
  }