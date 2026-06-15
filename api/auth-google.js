export default function handler(req, res) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const user = req.query.user || 'dang';
  const REDIRECT_URI = process.env.BASE_URL + '/api/callback-google';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly')}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${user}`;
  res.redirect(authUrl);
}
