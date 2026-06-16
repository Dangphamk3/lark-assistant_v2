import { getValidToken } from "../lib/token.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = req.query.user || 'dang';
  const emails = req.body?.emails || [];

  const token = await getValidToken(user);
  if (!token) {
    return res.status(401).json({ error: "Lark not connected. Visit /api/auth first." });
  }

  const r = await fetch("https://open.larksuite.com/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ emails }),
  });
  const data = await r.json();
  return res.status(r.status).json(data);
}
