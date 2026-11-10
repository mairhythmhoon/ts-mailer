// Developed By github.com/@mairhythmhoon
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({path:"Secure/.env"});

interface FestivalEvent {
    date: string;
    festival_name: string;
}

async function main_(): Promise<void> {
    const CURRENT_YEAR = new Date().getFullYear();

    const CALENDAR_URL = process.env.CALENDAR_URL;

if (!CALENDAR_URL) {
        console.error("Missing CALENDAR_URL in .env file");
        process.exit(1);
    }

    const OUTPUT_FILE = path.join("Data", "festivals.json");

    function parseIcs(icsText: string): FestivalEvent[] {
        const events: FestivalEvent[] = [];
        const lines = icsText.split(/\r?\n/);
        let event: Partial<FestivalEvent> = {};

        for (let line of lines) {
            line = line.trim();

            if (line === "BEGIN:VEVENT") {
                event = {};
            } else if (line.startsWith("DTSTART")) {
                const dateRaw = line.split(":").pop()!.slice(0, 8);
                // dateRaw format: YYYYMMDD
                const year = dateRaw.slice(0, 4);
                const month = dateRaw.slice(4, 6);
                const day = dateRaw.slice(6, 8);
                event.date = `${day}-${month}-${year}`;
            } else if (line.startsWith("SUMMARY")) {
                event.festival_name = line.split(":").slice(1).join(":");
            } else if (line === "END:VEVENT") {
                if (
                    event.date &&
                    event.festival_name &&
                    parseInt(event.date.split("-")[2], 10) === CURRENT_YEAR
                ) {
                    events.push({
                        date: event.date,
                        festival_name: event.festival_name,
                    });
                }
            }
        }

        return events;
    }

    // Sort by date (DD-MM-YYYY)
    const parseDate = (d: string): number => {
        const [day, month, year] = d.split("-").map(Number);
        return new Date(year, month - 1, day).getTime();
    };

    try {
        const response = await fetch(CALENDAR_URL, {
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const events = parseIcs(text).sort(
            (a, b) => parseDate(a.date) - parseDate(b.date)
        );

        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(events, null, 4), {
            encoding: "utf-8",
        });

        console.log(`Wrote ${events.length} events to ${OUTPUT_FILE}`);
    } catch (e) {
        console.error("Failed to fetch or write calendar:", e);
    }
}

if (require.main === module) {
    main_();
}

export { main_ };