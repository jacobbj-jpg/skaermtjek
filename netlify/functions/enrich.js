// netlify/functions/enrich.js
// HURTIG berigelse: scores + analyse + bullets (ca. 10-15 sek)

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { title, platform, episode, notes, ratingId } = JSON.parse(event.body);
    if (!title || !platform) return { statusCode: 400, headers, body: JSON.stringify({ error: 'title og platform er påkrævet' }) };

    const PLATFORM_LABEL = {
      youtube: 'YouTube', netflix: 'Netflix', disney: 'Disney+', dr: 'DR',
      tv2: 'TV 2 Play', viaplay: 'Viaplay', max: 'Max', hbo: 'Max',
      skyshowtime: 'SkyShowtime', sfkids: 'SF Kids',
      gaming: 'Konsol/PC', switch: 'Nintendo Switch', ipad: 'iPad',
      tiktok: 'TikTok', instagram: 'Instagram', snapchat: 'Snapchat',
      ytshorts: 'YouTube Shorts', bereal: 'BeReal',
      discord: 'Discord', twitch: 'Twitch'
    };

    const platformLabel = PLATFORM_LABEL[platform] || platform;

    const prompt = `Dansk mediepædagog vurderer "${title}" (${platformLabel})${episode ? ' - ' + episode : ''}${notes ? ' - ' + notes : ''} for skaermtjek.dk.

Returner KUN JSON:
{
"recommended_age": <heltal 2-18>,
"age_group": "<0-2|2-4|4-6|7-9|10-12|13+>",
"ai_scores": {"violence":<1-10>,"language":<1-10>,"dopamine":<1-10>,"retention":<1-10>,"commercialism":<1-10>,"values":<1-10>,"sexual":<1-10>,"fear":<1-10>,"passive":<1-10>,"socialpressure":<1-10>},
"ai_analysis": "<3-4 sætninger: titel, positiv, bekymring, aldersanbefaling>",
"ai_bullets": [{"icon":"<emoji>","highlight":"<1-3 ord>","text":"<max 60 tegn>"}]
}

Krav: 1=lav bekymring, 10=høj. values: 1=fremragende, 10=problematisk. passive: 1=aktivt, 10=passivt. 4 bullets (mix +/-). Ikoner: ✨💡🎨🧠📚⚔️🗣️🎰🔔💰🔞😨👥.

Er titlen ukendt: brug middelscore 5 og nævn usikkerhed i ai_analysis.

Kun JSON.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY mangler' }) };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API fejl', details: errorText }) };
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'JSON parse fejl', raw: text.substring(0, 500) }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, ratingId: ratingId || null, enrichment: parsed })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
