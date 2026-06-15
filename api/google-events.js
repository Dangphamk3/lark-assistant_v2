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
  const user_id = req.query.user || 'dang';
  const token = await getValidGoogleToken(user_id);
  if (!token) {
    return res.status(401).json({ error: "Google not connected. Visit /api/auth-google first." });
  }
  // POST: Tạo sự kiện Google Calendar (check trùng + mời người qua email)
  if (req.method === "POST") {
    const { summary, start, end, description, attendees } = req.body;
    if (!summary || !start || !end) {
      return res.status(400).json({ error: "Thiếu summary, start hoặc end" });
    }
    const startISO = new Date(start * 1000).toISOString();
    const endISO = new Date(end * 1000).toISOString();

    // 🔍 Check trùng: đã có sự kiện cùng tên trong khung giờ này chưa?
    const checkUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startISO)}&timeMax=${encodeURIComponent(endISO)}&singleEvents=true&orderBy=startTime`;
    const checkRes = await fetch(checkUrl, { headers: { Authorization: `Bearer ${token}` } });
    const checkData = await checkRes.json();
    const dup = (checkData.items || []).find((e) => {
      const eStart = e.start?.dateTime || e.start?.date;
      return (e.summary || "").trim().toLowerCase() === summary.trim().toLowerCase()
        && Math.abs(new Date(eStart).getTime() - new Date(startISO).getTime()) < 60000;
    });
    if (dup) {
      return res.status(200).json({
        success: false,
        duplicate: true,
        message: `Đã có sự kiện "${dup.summary}" vào thời gian này rồi, không tạo thêm.`,
        existing_event_id: dup.id,
        link: dup.htmlLink,
      });
    }

    const event = {
      summary,
      description: description || "",
      start: { dateTime: startISO, timeZone: "Asia/Ho_Chi_Minh" },
      end: { dateTime: endISO, timeZone: "Asia/Ho_Chi_Minh" },
    };
    // 👥 Thêm người tham dự nếu có email
    if (Array.isArray(attendees) && attendees.length > 0) {
      event.attendees = attendees.map((email) => ({ email }));
    }

    const gRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
    const data = await gRes.json();
    if (!gRes.ok) {
      return res.status(gRes.status).json({ error: data.error?.message || "Lỗi tạo sự kiện" });
    }
    return res.status(200).json({
      success: true,
      event_id: data.id,
      title: data.summary,
      start_display: toVNTime(data.start?.dateTime),
      end_display: toVNTime(data.end?.dateTime),
      attendees: (data.attendees || []).map((a) => a.email),
      link: data.htmlLink,
    });
  }
  // GET: Đọc sự kiện Google Calendar
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
  return res.status(200).json({ total: events.length, events, raw: data });
}
