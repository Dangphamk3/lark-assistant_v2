import { getValidGoogleToken } from "../lib/google-token.js";
export default async function handler(req, res) {
  const SHEET_ID = req.query.sheetId;
  if (!SHEET_ID) {
    return res.status(400).json({ error: "Missing sheetId query param" });
  }
  const user_id = req.query.user || 'dang';
  const token = await getValidGoogleToken(user_id);
  if (!token) {
    return res.status(401).json({ error: "Google not connected. Visit /api/auth-google first." });
  }
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const sheets = (meta.sheets || []).map((s) => ({
    title: s.properties.title,
    gid: s.properties.sheetId,
    index: s.properties.index,
  }));
  return res.status(200).json({ total: sheets.length, sheets });
}
