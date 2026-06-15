import { getValidGoogleToken } from "../lib/google-token.js";
const DEFAULT_GID = "493943648";
export default async function handler(req, res) {
  const SHEET_ID = req.query.sheetId;
  if (!SHEET_ID) {
    return res.status(400).json({ error: "Missing sheetId query param" });
  }
  const GID = req.query.gid || DEFAULT_GID;
  const user_id = req.query.user || 'dang';
  const token = await getValidGoogleToken(user_id);
  if (!token) {
    return res.status(401).json({ error: "Google not connected. Visit /api/auth-google first." });
  }
  // Lấy tên sheet (tab) từ gid
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const sheetProps = (meta.sheets || []).find(
    (s) => String(s.properties.sheetId) === GID
  )?.properties;
  if (!sheetProps) {
    return res.status(404).json({ error: "Sheet tab not found", meta });
  }
  const sheetName = sheetProps.title;
  // Lấy toàn bộ dữ liệu của sheet
  const range = `${encodeURIComponent(sheetName)}!A1:Z100`;
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await dataRes.json();
  if (data.error) {
    return res.status(500).json({ error: "Sheets API error", sheetName, GID, detail: data.error });
  }
  const rows = data.values || [];
  if (rows.length === 0) {
    return res.status(200).json({ total: 0, tasks: [], debug: { sheetName, GID, rawKeys: Object.keys(data) } });
  }
  const headers = rows[0];
  const tasks = rows.slice(1)
    .filter((row) => row.length > 0 && row.some((c) => c && c.trim()))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });
  // Optional filter: ?person=Tên người phụ trách
  const person = req.query.person;
  const filtered = person
    ? tasks.filter(
        (t) =>
          (t["Người phụ trách"] || "").toLowerCase().includes(person.toLowerCase()) ||
          (t["Người hỗ trợ"] || "").toLowerCase().includes(person.toLowerCase())
      )
    : tasks;
  return res.status(200).json({ total: filtered.length, tasks: filtered });
}
