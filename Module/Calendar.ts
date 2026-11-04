// Developed By github.com/@mairhythmhoon
import * as fs from "fs";
import * as path from "path";

interface FestivalEvent {
    date: string;
    festival_name: string;
    calendar: string;
}

async function main_(): Promise<void> {
    const CURRENT_YEAR = new Date().getFullYear();

    const CALENDARS: Record<string, string> = {
        Hindu: "https://calendar.google.com/calendar/ical/en.hinduism%23holiday%40group.v.calendar.google.com/public/basic.ics",
        Indian: "https://calendar.google.com/calendar/ical/en-in.indian%23holiday%40group.v.calendar.google.com/public/basic.ics",
    };

    const OUTPUT_FILE = path.join("Data", "festivals.json");

    function parseIcs(icsText: string, calendarName: string): FestivalEvent[] {
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
                        calendar: calendarName,
                    });
                }
            }
        }

        return events;
    }

    const allEvents: FestivalEvent[] = [];

    for (const [calendarName, url] of Object.entries(CALENDARS)) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            const text = await response.text();
            allEvents.push(...parseIcs(text, calendarName));
        } catch (e) {
            console.error(`Failed to fetch ${calendarName} calendar:`, e);
        }
    }

    // Merge duplicate festivals
    const mergedEvents = new Map<string, FestivalEvent>();

    for (const event of allEvents) {
        const key = `${event.date}|${event.festival_name}`;

        if (!mergedEvents.has(key)) {
            mergedEvents.set(key, { ...event });
        } else {
            // Same festival exists in another calendar
            mergedEvents.get(key)!.calendar = "merged";
        }
    }

    // Sort by date (DD-MM-YYYY)
    const parseDate = (d: string): number => {
        const [day, month, year] = d.split("-").map(Number);
        return new Date(year, month - 1, day).getTime();
    };

    const finalEvents = Array.from(mergedEvents.values()).sort(
        (a, b) => parseDate(a.date) - parseDate(b.date)
    );

    try {
        // Ensure the output directory exists
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalEvents, null, 4), {
            encoding: "utf-8",
        });
    } catch (e) {
        console.error("Failed to write output file:", e);
    }
}

if (require.main === module) {
    main_();
}

export { main_ };
