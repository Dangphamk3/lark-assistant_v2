import { neon } from "@neondatabase/serverless";

export async function getValidGoogleToken() {
  const sql = neon(process.env.DATABASE_URL);
  const [row] = await sql`SELECT * FROM tokens WHERE id = 1`;
  if (!row || !row.google_refresh_token) return null;

  if (Date.now() < row.google_expires_at - 60000) {
    return row.google_access_token;
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: row.google_refresh_token,
    }),
  });

  const data = await tokenRes.json();
  if (!data.access_token) {
    console.error("Google refresh failed:", JSON.stringify(data));
    return row.google_access_token;
  }

  await sql`
    UPDATE tokens SET
      google_access_token = ${data.access_token},
      google_expires_at = ${Date.now() + (data.expires_in || 3600) * 1000}
    WHERE id = 1
  `;

  return data.access_token;
}
