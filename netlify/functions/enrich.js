// netlify/functions/enrich.js
// Beriger en vurdering med AI-genereret indhold via Claude API

exports.handler = async (event, context) => {
const headers = {
‘Access-Control-Allow-Origin’: ‘*’,
‘Access-Control-Allow-Headers’: ‘Content-Type’,
‘Access-Control-Allow-Methods’: ‘POST, OPTIONS’,
‘Content-Type’: ‘application/json’
};

if (event.httpMethod === ‘OPTIONS’) {
return { statusCode: 200, headers, body: ‘’ };
}

if (event.httpMethod !== ‘POST’) {
return { statusCode: 405, headers, body: JSON.stringify({ error: ‘Method not allowed’ }) };
}

try {
const { title, platform, episode, notes, ratingId } = JSON.parse(event.body);

```
if (!title || !platform) {
  return { statusCode: 400, headers, body: JSON.stringify({ error: 'title og platform er påkrævet' }) };
}

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

const prompt = `Dansk mediepædagog for skaermtjek.dk. Vurder "${title}" (${platformLabel})${episode ? ' - ' + episode : ''}${notes ? ' - ' + notes : ''}.
```

Ren JSON (1=lav, 10=høj):

{
“recommended_age”: <2-18>,
“age_group”: “<0-2|2-4|4-6|7-9|10-12|13+>”,
“ai_scores”: {“violence”:<n>,“language”:<n>,“dopamine”:<n>,“retention”:<n>,“commercialism”:<n>,“values”:<n>,“sexual”:<n>,“fear”:<n>,“passive”:<n>,“socialpressure”:<n>},
“ai_analysis”: “<3-4 sætninger: titel, positiv, bekymring, aldersanbefaling>”,
“ai_bullets”: [{“icon”:”<emoji>”,“highlight”:”<1-3 ord>”,“text”:”<max 60 tegn>”}],
“ai_category_texts”: {“violence”:”<2 sætn>”,“language”:”<2 sætn>”,“dopamine”:”<2 sætn>”,“retention”:”<2 sætn>”,“commercialism”:”<2 sætn>”,“values”:”<2 sætn>”,“sexual”:”<2 sætn>”,“fear”:”<2 sætn>”,“passive”:”<2 sætn>”,“socialpressure”:”<2 sætn>”},
“ai_faq”: [{“q”:”?”,“a”:“svar”}]
}

4 bullets (mix +/-), 3 FAQ. Ikoner: ✨💡🎨🧠📚⚔️🗣️🎰🔔💰🔞😨👥. values: 1=fremragende. passive: 1=aktivt. Konkret dansk. Kun JSON.`;

```
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY mangler' }) };
}

// Sonnet 4.6 - 3-5x hurtigere end Opus, fremragende til denne opgave
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
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
```

} catch (err) {
return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
}
};
