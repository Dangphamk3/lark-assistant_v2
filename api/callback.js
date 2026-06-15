import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const { code, state } = req.query;
  const user_id = state || 'dang';
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
    body: JSON.stringify({ grant_type: "authorization_code", code }),
  });

  const result = await tokenRes.json();
  const data = result.data || {};

  if (!data.access_token) {
    return res.status(400).json({ error: "Lark auth failed", detail: result });
  }

  const sql = neon(process.env.DATABASE_URL);
  await sql`
    INSERT INTO tokens (user_id, access_token, refresh_token, expires_at)
    VALUES (${user_id}, ${data.access_token}, ${data.refresh_token}, ${Date.now() + (data.expires_in || 7200) * 1000})
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = ${data.access_token},
      refresh_token = ${data.refresh_token},
      expires_at = ${Date.now() + (data.expires_in || 7200) * 1000}
  `;

  return res.send(`✅ Đăng nhập thành công! Token của "${user_id}" đã được lưu.`);
}
