import { getValidGoogleToken } from "../lib/google-token.js";
export default async function handler(req, res) {
  const user_id = req.query.user || 'dang';
  const token = await getValidGoogleToken(user_id);
  if (!token) {
    return res.status(401).json({ error: "Google not connected. Visit /api/auth-google first." });
  }
  const folderId = req.query.folderId || 'root';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false`
  )}&fields=files(id,name,mimeType)`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await resp.json();
  if (data.error) {
    return res.status(500).json({ error: data.error });
  }
  const items = (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    type:
      f.mimeType === "application/vnd.google-apps.folder"
        ? "folder"
        : f.mimeType === "application/vnd.google-apps.spreadsheet"
        ? "spreadsheet"
        : "other",
  }));
  return res.status(200).json({ folderId, total: items.length, items });
}
