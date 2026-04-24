// netlify/functions/enrich-deep.js
// GRUNDIG berigelse: per-kategori tekster + FAQ (kræver at grundscores allerede er genereret)

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
    const { title, platform, episode, notes, ai_scores, recommended_age, ratingId } = JSON.parse(event.body);
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
    const scoresStr = ai_scores ? JSON.stringify(ai_scores) : '(ukendt)';

    // Kun per-kategori tekster og FAQ - mere fokuseret prompt
    const prompt = `Dansk mediepædagog for skaermtjek.dk. "${title}" (${platformLabel})${episode ? ' - ' + episode : ''}. Anbefalet ${recommended_age || '?'} år. Scores: ${scoresStr}.

Returner JSON med 2-sætnings begrundelser for HVORFOR scoren er som den er:

{
"ai_category_texts": {
"violence":"<2 konkrete sætninger>",
"language":"<2 konkrete sætninger>",
"dopamine":"<2 konkrete sætninger>",
"retention":"<2 konkrete sætninger>",
"commercialism":"<2 konkrete sætninger>",
"values":"<2 konkrete sætninger>",
"sexual":"<2 konkrete sætninger>",
"fear":"<2 konkrete sætninger>",
"passive":"<2 konkrete sætninger>",
"socialpressure":"<2 konkrete sætninger>"
},
"ai_faq": [
{"q":"<forældrespørgsmål>","a":"<1-2 sætninger>"},
{"q":"<forældrespørgsmål>","a":"<1-2 sætninger>"},
{"q":"<forældrespørgsmål>","a":"<1-2 sætninger>"}
]
}

Hver kategori-tekst skal være KONKRET for denne titel (nævn specifikke features, karakterer, mekanikker). 3 FAQ om aldersgrænse, problematisk indhold, og alternativer/tips. Kun JSON.`;

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
        max_tokens: 2000,
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
