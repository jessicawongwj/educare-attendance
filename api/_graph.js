let _token = null, _tokenExpiry = 0;

async function getGraphToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('Graph token error: ' + JSON.stringify(data));
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

async function sendMail({ to, subject, htmlBody }) {
  const token = await getGraphToken();
  const recipients = Array.isArray(to) ? to : [to];
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MAIL_FROM)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          bccRecipients: recipients.map(a => ({ emailAddress: { address: a } })),
        },
        saveToSentItems: false,
      }),
    }
  );
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Graph sendMail ${r.status}: ${txt}`);
  }
}

module.exports = { sendMail };
