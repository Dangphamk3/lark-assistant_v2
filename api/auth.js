export default function handler(req, res) {
  const APP_ID = process.env.LARK_APP_ID;
  const user = req.query.user || 'dang';
  const REDIRECT_URI = process.env.BASE_URL + '/api/callback';
  const authUrl = `https://open.larksuite.com/open-apis/authen/v1/authorize?` +
    `app_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('calendar:calendar im:message:readonly im:message im:message.send_as_user im:chat:readonly docx:document:readonly task:task:read task:task:write contact:user.id:readonly offline_access')}` +
    `&state=${user}`;
  res.redirect(authUrl);
}
