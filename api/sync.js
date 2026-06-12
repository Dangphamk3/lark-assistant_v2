import { neon } from "@neondatabase/serverless";
import { getValidGoogleToken } from "../lib/google-token.js";
import { getValidToken } from "../lib/token.js";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    const googleToken = await getValidGoogleToken();
    const larkToken = await getValidToken();

    if (!googleToken) {
      return res.status(401).json({ error: "Google not connected. Visit /api/auth-google first." });
    }
    if (!larkToken) {
      return res.status(401).json({ error: "Lark not connected. Visit /api/auth first." });
    }

    // 1. Lấy sync token hiện tại
    const [state] = await sql`SELECT sync_token FROM sync_state WHERE id = 'google_calendar'`;
    let syncToken = state?.sync_token;

    // 2. Gọi Google Calendar API
    let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true`;
    if (syncToken) {
      url += `&syncToken=${syncToken}`;
    } else {
      url += `&timeMin=${new Date().toISOString()}`;
    }

    let resp = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
    let data = await resp.json();

    // Sync token hết hạn -> reset, lấy lại từ hiện tại
    if (resp.status === 410) {
      url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${new Date().toISOString()}`;
      resp = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
      data = await resp.json();
    }

    if (data.error) {
      return res.status(500).json({ error: "Google API error", detail: data });
    }

    const events = data.items || [];
    const results = [];

    // 3. Xử lý từng event thay đổi
    for (const event of events) {
      const [existingMapping] = await sql`
        SELECT lark_event_id FROM event_mapping WHERE google_event_id = ${event.id}
      `;

      if (event.status === "cancelled") {
        if (existingMapping) {
          await fetch(`https://open.larksuite.com/open-apis/calendar/v4/calendars/primary/events/${existingMapping.lark_event_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${larkToken}` },
          });
          await sql`DELETE FROM event_mapping WHERE google_event_id = ${event.id}`;
          results.push({ id: event.id, action: "deleted" });
        }
        continue;
      }

      const startDt = event.start?.dateTime || event.start?.date;
      const endDt = event.end?.dateTime || event.end?.date;

      const larkEventBody = {
        summary: event.summary || "(no title)",
        description: event.description || "",
        start_time: { timestamp: String(Math.floor(new Date(startDt).getTime() / 1000)) },
        end_time: { timestamp: String(Math.floor(new Date(endDt).getTime() / 1000)) },
      };

      if (existingMapping) {
        // Update event đã có trên Lark
        await fetch(`https://open.larksuite.com/open-apis/calendar/v4/calendars/primary/events/${existingMapping.lark_event_id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${larkToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(larkEventBody),
        });
        results.push({ id: event.id, action: "updated" });
      } else {
        // Tạo event mới trên Lark
        const createResp = await fetch(`https://open.larksuite.com/open-apis/calendar/v4/calendars/primary/events`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${larkToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(larkEventBody),
        });
        const createData = await createResp.json();
        const larkEventId = createData?.data?.event?.event_id;

        if (larkEventId) {
          await sql`
            INSERT INTO event_mapping (google_event_id, lark_event_id)
            VALUES (${event.id}, ${larkEventId})
            ON CONFLICT (google_event_id) DO UPDATE SET lark_event_id = ${larkEventId}, updated_at = NOW()
          `;
          results.push({ id: event.id, action: "created", larkEventId });
        } else {
          results.push({ id: event.id, action: "failed", error: createData });
        }
      }
    }

    // 4. Lưu sync token mới
    if (data.nextSyncToken) {
      await sql`UPDATE sync_state SET sync_token = ${data.nextSyncToken}, updated_at = NOW() WHERE id = 'google_calendar'`;
    }

    return res.status(200).json({ total: events.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
