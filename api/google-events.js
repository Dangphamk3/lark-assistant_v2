import { getValidGoogleToken } from "../lib/google-token.js";

function toVNTime(dateStr) {
  return new Date(dateStr).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function handler(req, res) {
  const token = await getValidGoogleToken();

  if (!token) {
    return res.status(401).json({ error: "Google not connected. Visit /api/auth-google first." });
  }

  const now = Date.now();
  const timeMin = req.query.start
    ? new Date(parseInt(req.query.start) * 1000).toISOString()
    : new Date(now).toISOString();
  const timeMax = req.query.end
    ? new Date(parseInt(req.query.end) * 1000).toISOString()
    : new Date(now + 7 * 24 * 3600 * 1000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&timeZone=Asia/Ho_Chi_Minh`;

  const gRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await gRes.json();

  const events = (data.items || []).map(e => {
    const startDt = e.start?.dateTime || e.start?.date;
    const endDt = e.end?.dateTime || e.end?.date;
    return {
      title: e.summary,
      start: startDt,
      end: endDt,
      start_display: toVNTime(startDt),
      end_display: toVNTime(endDt),
      description: e.description || "",
      location: e.location || "",
    };
  });

  return res.status(200).json({ total: events.length, events });
}
