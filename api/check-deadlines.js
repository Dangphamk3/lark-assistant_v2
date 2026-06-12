import { neon } from "@neondatabase/serverless";
import { getValidGoogleToken } from "../lib/google-token.js";
import { getValidToken } from "../lib/token.js";

const sql = neon(process.env.DATABASE_URL);
const ROOT_FOLDER_ID = "1f61D5spcEE_6f3o8O53bJc6tuiBEazES";
const LARK_OPEN_ID = "ou_29d1b36650b710e31ed50f3b3a0f5878";

// Parse "dd/mm/yyyy" -> Date (local midnight)
function parseDate(str) {
  if (!str) return null;
  const parts = str.trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function daysDiff(date, today) {
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function driveList(token, folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false`
  )}&fields=files(id,name,mimeType)`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await resp.json();
  return data.files || [];
}

async function sheetTabs(token, sheetId) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return (data.sheets || []).map((s) => s.properties);
}

async function sheetValues(token, sheetId, sheetName) {
  const range = `${encodeURIComponent(sheetName)}!A1:Z200`;
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return data.values || [];
}

async function sendLarkMessage(larkToken, text) {
  await fetch("https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=open_id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${larkToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receive_id: LARK_OPEN_ID,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });
}

export default async function handler(req, res) {
  try {
    const googleToken = await getValidGoogleToken();
    const larkToken = await getValidToken();
    if (!googleToken || !larkToken) {
      return res.status(401).json({ error: "Missing valid tokens" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts = { overdue: [], today: [], upcoming: [] };

    // 1. Lấy folder con
    const folders = await driveList(googleToken, ROOT_FOLDER_ID);
    const subFolders = folders.filter((f) => f.mimeType === "application/vnd.google-apps.folder");

    for (const folder of subFolders) {
      // 2. Lấy sheet trong folder con
      const files = await driveList(googleToken, folder.id);
      const sheets = files.filter((f) => f.mimeType === "application/vnd.google-apps.spreadsheet");

      for (const sheet of sheets) {
        // 3. Lấy tab trong sheet
        const tabs = await sheetTabs(googleToken, sheet.id);

        for (const tab of tabs) {
          const rows = await sheetValues(googleToken, sheet.id, tab.title);
          if (rows.length < 2) continue;

          const headers = rows[0];
          const colIdx = {
            deadline: headers.indexOf("Deadline"),
            hoanThanh: headers.indexOf("Ngày hoàn thành"),
            taskChiTiet: headers.indexOf("Task chi tiết"),
            taskChinh: headers.indexOf("Task chính"),
            nguoiPhuTrach: headers.indexOf("Người phụ trách"),
            trangThai: headers.indexOf("Trạng thái"),
          };
          if (colIdx.deadline === -1) continue;

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const deadlineStr = row[colIdx.deadline];
            const completedStr = colIdx.hoanThanh >= 0 ? row[colIdx.hoanThanh] : "";
            const deadline = parseDate(deadlineStr);
            if (!deadline) continue;
            if (completedStr && completedStr.trim()) continue; // đã hoàn thành -> bỏ qua

            const diff = daysDiff(deadline, today);
            const taskKey = `${sheet.id}|${tab.sheetId}|${i}`;

            const taskInfo = {
              taskKey,
              folder: folder.name,
              sheet: sheet.name,
              tab: tab.title,
              taskChinh: colIdx.taskChinh >= 0 ? row[colIdx.taskChinh] : "",
              taskChiTiet: colIdx.taskChiTiet >= 0 ? row[colIdx.taskChiTiet] : "",
              nguoiPhuTrach: colIdx.nguoiPhuTrach >= 0 ? row[colIdx.nguoiPhuTrach] : "",
              deadline: deadlineStr,
            };

            if (diff < 0) {
              alerts.overdue.push(taskInfo);
            } else if (diff === 0) {
              alerts.today.push(taskInfo);
            } else if (diff === 1 || diff === 2) {
              alerts.upcoming.push(taskInfo);
            }
          }
        }
      }
    }

    // 4. Lọc những task chưa được báo (theo alert_type) và gửi tin nhắn
    const sentSummary = { overdue: 0, today: 0, upcoming: 0 };

    for (const [type, list] of Object.entries(alerts)) {
      for (const t of list) {
        const [existing] = await sql`
          SELECT 1 FROM deadline_alerts WHERE task_key = ${t.taskKey} AND alert_type = ${type}
        `;
        if (existing) continue;

        const label = type === "overdue" ? "QUÁ HẠN" : type === "today" ? "ĐẾN HẠN HÔM NAY" : "SẮP ĐẾN HẠN";
        const text = `⚠️ ${label}\nDự án: ${t.folder} (${t.sheet} / ${t.tab})\nTask: ${t.taskChinh} - ${t.taskChiTiet}\nNgười phụ trách: ${t.nguoiPhuTrach}\nDeadline: ${t.deadline}`;
        await sendLarkMessage(larkToken, text);

        await sql`
          INSERT INTO deadline_alerts (task_key, alert_type) VALUES (${t.taskKey}, ${type})
          ON CONFLICT (task_key, alert_type) DO NOTHING
        `;
        sentSummary[type]++;
      }
    }

    return res.status(200).json({ checked: alerts, sent: sentSummary });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
