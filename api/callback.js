import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });

  const APP_ID = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;
  const REDIRECT_URI = process.env.BASE_URL + '/api/callback';

  const credentials = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");

  const tokenRes = await fetch("https://open.larksuite.com/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await tokenRes.json();

  const accessToken = data?.access_token;
  const refreshToken = data?.refresh_token;
  const expiresIn = data?.expires_in || 7200;

  if (!accessToken) {
    return res.status(400).json({ error: "Lark auth failed", detail: data });
  }

  const sql = neon(process.env.DATABASE_URL);

  await sql`
    INSERT INTO tokens (id, access_token, refresh_token, expires_at)
    VALUES (1, ${accessToken}, ${refreshToken}, ${Date.now() + expiresIn * 1000})
    ON CONFLICT (id) DO UPDATE SET
      access_token = ${accessToken},
      refresh_token = ${refreshToken},
      expires_at = ${Date.now() + expiresIn * 1000}
  `;

  return res.send("✅ Đăng nhập thành công! Token đã được lưu. Bạn có thể đóng tab này.");
}
