import { neon } from "@neondatabase/serverless";
import { getValidToken } from "../lib/token.js";

const sql = neon(process.env.DATABASE_URL);

function normalizeName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export default async function handler(req, res) {
  try {
    // (tuỳ chọn) bảo vệ cron bằng CRON_SECRET nếu có đặt env
    if (process.env.CRON_SECRET) {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const user = req.query.user || "dang";
    const token = await getValidToken(user);
    if (!token) return res.status(401).json({ error: "Lark not connected. Visit /api/auth first." });

    const headers = { Authorization: `Bearer ${token}` };
    let saved = 0;
    let chatsScanned = 0;
    const seen = new Set();

    // 1. Lấy tất cả nhóm (có phân trang)
    const chatIds = [];
    let chatPageToken = "";
    do {
      const url = `https://open.larksuite.com/open-apis/im/v1/chats?page_size=100${chatPageToken ? `&page_token=${chatPageToken}` : ""}`;
      const r = await fetch(url, { headers });
      const d = await r.json();
      (d.data?.items || []).forEach((c) => chatIds.push(c.chat_id));
      chatPageToken = d.data?.has_more ? d.data.page_token : "";
    } while (chatPageToken);

    // 2. Lấy thành viên từng nhóm → lưu danh bạ
    for (const chatId of chatIds) {
      chatsScanned++;
      let memPageToken = "";
      do {
        const url = `https://open.larksuite.com/open-apis/im/v1/chats/${chatId}/members?member_id_type=open_id&page_size=100${memPageToken ? `&page_token=${memPageToken}` : ""}`;
        const r = await fetch(url, { headers });
        const d = await r.json();
        const items = d.data?.items || [];
        for (const m of items) {
          const openId = m.member_id;
          const name = m.name;
          if (!openId || !name) continue;
          const key = normalizeName(name);
          if (seen.has(key)) continue;
          seen.add(key);
          await sql`
            INSERT INTO contacts (name_key, display_name, open_id, updated_at)
            VALUES (${key}, ${name}, ${openId}, NOW())
            ON CONFLICT (name_key) DO UPDATE SET
              display_name = ${name},
              open_id = COALESCE(${openId}, contacts.open_id),
              updated_at = NOW()
          `;
          saved++;
        }
        memPageToken = d.data?.has_more ? d.data.page_token : "";
      } while (memPageToken);
    }

    return res.status(200).json({ ok: true, chatsScanned, saved });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
