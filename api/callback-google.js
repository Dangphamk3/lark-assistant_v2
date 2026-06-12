import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = process.env.BASE_URL + '/api/callback-google';

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });

  const data = await tokenRes.json();

  if (!data.access_token) {
    return res.status(400).json({ error: "Google auth failed", detail: data });
  }

  const sql = neon(process.env.DATABASE_URL);

  await sql`
    UPDATE tokens SET
      google_access_token = ${data.access_token},
      google_refresh_token = ${data.refresh_token || null},
      google_expires_at = ${Date.now() + (data.expires_in || 3600) * 1000}
    WHERE id = 1
  `;

  return res.send("✅ Google Calendar đã kết nối thành công! Bạn có thể đóng tab này.");
}
