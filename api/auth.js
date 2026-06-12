export default function handler(req, res) {
  const APP_ID = process.env.LARK_APP_ID;
  const REDIRECT_URI = process.env.BASE_URL + '/api/callback';

  const authUrl = `https://open.larksuite.com/open-apis/authen/v1/authorize?` +
    `app_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('calendar:calendar im:message:readonly docx:document:readonly task:task:read task:task:write')}`;

  res.redirect(authUrl);
}
