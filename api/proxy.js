import { getValidToken } from "../lib/token.js";

export default async function handler(req, res) {
  const user_id = req.query.user || 'dang';
  const token = await getValidToken(user_id);

  if (!token) {
    return res.status(401).json({ error: "Not authenticated. Visit /api/auth first." });
  }

  const { path, user, ...queryParams } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : path;
  const qs = new URLSearchParams(queryParams).toString();
  const larkUrl = `https://open.larksuite.com/open-apis/${pathStr}${qs ? '?' + qs : ''}`;

  const larkRes = await fetch(larkUrl, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: ['GET', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body),
  });

  const data = await larkRes.json();
  return res.status(larkRes.status).json(data);
}
