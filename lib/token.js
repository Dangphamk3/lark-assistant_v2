import { neon } from "@neondatabase/serverless";

export async function getValidToken() {
  const sql = neon(process.env.DATABASE_URL);
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
