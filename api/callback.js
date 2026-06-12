import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });

  const APP_ID = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;

  const appTokenRes = await fetch("https://open.larksuite.com/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const appTokenData = await appTokenRes.json();
  const appAccessToken = appTokenData.app_access_token;

  const tokenRes = await fetch("https://open.larksuite.com/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
    }),
  });

  const result = await tokenRes.json();
  const data = result.data || {};

  if (!data.access_token) {
    return res.status(400).json({ error: "Lark auth failed", detail: result });
  }

  const sql = neon(process.env.DATABASE_URL);
  await sql`
    UPDATE tokens SET
      access_token = ${data.access_token},
      refresh_token = ${data.refresh_token},
      expires_at = ${Date.now() + (data.expires_in || 7200) * 1000}
    WHERE id = 1
  `;

  return res.json({ success: true, appTokenData, result, data });
}
