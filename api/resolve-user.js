export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const emails = req.body?.emails || [];
  const APP_ID = process.env.LARK_APP_ID;
  const APP_SECRET = process.env.LARK_APP_SECRET;

  // 1. Lấy tenant_access_token (token cấp app, không phải user)
  const tokenRes = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const tokenData = await tokenRes.json();
  const tenantToken = tokenData.tenant_access_token;
  if (!tenantToken) {
    return res.status(500).json({ error: "Cannot get tenant token", detail: tokenData });
  }

  // 2. Tra open_id từ email bằng tenant token
  const r = await fetch("https://open.larksuite.com/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tenantToken}` },
    body: JSON.stringify({ emails }),
  });
  const data = await r.json();
  return res.status(r.status).json(data);
}
