import { neon } from "@neondatabase/serverless";

function normalize(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  if (req.method === "GET") {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const [row] = await sql`SELECT * FROM contacts WHERE name_key = ${normalize(name)}`;
    if (!row) return res.status(200).json({ found: false });
    return res.status(200).json({ found: true, contact: row });
  }

  if (req.method === "POST") {
    const { name, lark_email, google_email, open_id } = req.body;
    if (!name) return res.status(400).json({ error: "Missing name" });
    const key = normalize(name);
    await sql`
      INSERT INTO contacts (name_key, display_name, lark_email, google_email, open_id, updated_at)
      VALUES (${key}, ${name}, ${lark_email || null}, ${google_email || null}, ${open_id || null}, NOW())
      ON CONFLICT (name_key) DO UPDATE SET
        display_name = ${name},
        lark_email = COALESCE(${lark_email || null}, contacts.lark_email),
        google_email = COALESCE(${google_email || null}, contacts.google_email),
        open_id = COALESCE(${open_id || null}, contacts.open_id),
        updated_at = NOW()
    `;
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
