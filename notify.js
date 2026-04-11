// Netlify Function — sender email når ny vurdering modtages
// Kræver: RESEND_API_KEY og NOTIFY_EMAIL som environment variables i Netlify

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.log('Missing env vars');
    return { statusCode: 200, body: 'OK' }; // Fail silently
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Bad request' };
  }

  const { title, platform, content_type, episode, notes, parent_score } = body;

  const subject = `SkærmTjek: Ny vurdering afventer — ${title}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
      <h2 style="color: #1a1714;">Ny vurdering modtaget 🎯</h2>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; color: #888; width: 120px;">Titel</td><td style="padding: 8px 0; font-weight: 500;">${title}</td></tr>
        <tr><td style="padding: 8px 0; color: #888;">Platform</td><td style="padding: 8px 0;">${platform}</td></tr>
        <tr><td style="padding: 8px 0; color: #888;">Type</td><td style="padding: 8px 0;">${content_type}${episode ? ' — ' + episode : ''}</td></tr>
        <tr><td style="padding: 8px 0; color: #888;">Score</td><td style="padding: 8px 0;">${parent_score || '—'}/10</td></tr>
        ${notes ? `<tr><td style="padding: 8px 0; color: #888;">Notat</td><td style="padding: 8px 0; font-style: italic;">"${notes}"</td></tr>` : ''}
      </table>
      <div style="margin-top: 24px;">
        <a href="https://skaermtjek.netlify.app/?admin=1"
           style="background: #c0531a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Gå til admin og godkend →
        </a>
      </div>
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">SkærmTjek — automatisk notifikation</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SkærmTjek <noreply@skaermtjek.dk>',
        to: [NOTIFY_EMAIL],
        subject,
        html
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.log('Resend error:', err);
    }
  } catch (e) {
    console.log('Email error:', e);
  }

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: 'OK'
  };
};
