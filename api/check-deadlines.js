import { getValidGoogleToken } from "../lib/google-token.js";

async function listFolders(token, folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.files || [];
}

async function listSheetTabs(token, sheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return (data.sheets || []).map(s => s.properties);
}

async function readSheet(token, sheetId, sheetName) {
  const range = encodeURIComponent(`${sheetName}!A1:O500`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const values = data.values || [];
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row, idx) => {
    const obj = { _rowIndex: idx + 1 };
    headers.forEach((h, i) => obj[h] = row[i] || "");
    return obj;
  });
}

function parseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return new Date(`${y}-${m}-${d}`);
}

export default async function handler(req, res) {
  const token = await getValidGoogleToken();
  if (!token) return res.status(401).json({ error: "Google not connected" });

  const ROOT_FOLDER = "1f61D5spcEE_6f3o8O53bJc6tuiBEazES";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in2days = new Date(today);
  in2days.setDate(in2days.getDate() + 2);

  const overdue = [];
  const dueToday = [];
  const upcoming = [];

  const folders = await listFolders(token, ROOT_FOLDER);

  for (const folder of folders) {
    if (folder.mimeType !== 'application/vnd.google-apps.folder') continue;
    const files = await listFolders(token, folder.id);

    for (const file of files) {
      if (file.mimeType !== 'application/vnd.google-apps.spreadsheet') continue;
      const tabs = await listSheetTabs(token, file.id);

      for (const tab of tabs) {
        const rows = await readSheet(token, file.id, tab.title);

        for (const row of rows) {
          const deadline = parseDate(row["Deadline"]);
          if (!deadline) continue;

          const done = row["Ngày hoàn thành"] && row["Ngày hoàn thành"].trim() !== "";

          const item = {
            folder: folder.name,
            sheet: file.name,
            tab: tab.title,
            taskChinh: row["Task chính"],
            taskChiTiet: row["Task chi tiết"],
            nguoiPhuTrach: row["Người phụ trách"],
            deadline: row["Deadline"],
            trangThai: row["Trạng thái"],
          };

          if (done) continue;

          if (deadline < today) {
            overdue.push(item);
          } else if (deadline.getTime() === today.getTime()) {
            dueToday.push(item);
          } else if (deadline <= in2days) {
            upcoming.push(item);
          }
        }
      }
    }
  }

  return res.status(200).json({
    summary: { overdue: overdue.length, dueToday: dueToday.length, upcoming: upcoming.length },
    overdue,
    dueToday,
    upcoming,
  });
}
