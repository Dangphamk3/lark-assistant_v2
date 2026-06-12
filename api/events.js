import { neon } from "@neondatabase/serverless";

async function getValidToken(sql) {
  const [row] = await sql`SELECT * FROM tokens WHERE id = 1`;
  if (!row) return null;

  if (Date.now() < row.expires_at - 60000) {
    return row.access_token;
  }

  const APP_ID = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  const credentials = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");

  const tokenRes = await fetch("https://open.larksuite.com/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });

  const data = await tokenRes.json();
  if (!data.access_token) {
    console.error("Refresh failed:", JSON.stringify(data));
    return row.access_token;
  }

  await sql`
    UPDATE tokens SET
      access_token = ${data.access_token},
      refresh_token = ${data.refresh_token || row.refresh_token},
      expires_at = ${Date.now() + (data.expires_in || 7200) * 1000}
    WHERE id = 1
  `;

  return data.access_token;
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const token = await getValidToken(sql);

  if (!token) {
    return res.status(401).json({ error: "Not authenticated. Visit /api/auth first." });
  }

  const startTs = req.query.start || Math.floor(Date.now() / 1000);
  const endTs = req.query.end || (Math.floor(Date.now() / 1000) + 7 * 24 * 3600);

  const larkRes = await fetch(
    `https://open.larksuite.com/open-apis/calendar/v4/calendars/primary/events?start_time=${startTs}&end_time=${endTs}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );

  const data = await larkRes.json();
  return res.status(200).json(data);
}
