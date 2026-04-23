// netlify/functions/enrich.js
// Beriger en vurdering med AI-genereret indhold via Claude API
// Kaldes med POST { ratingId: 123 } fra admin-UI eller via batch-job

exports.handler = async (event, context) => {
  // CORS headers for at tillade browser-kald fra skaermtjek.dk
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { title, platform, episode, notes, ratingId } = JSON.parse(event.body);

    if (!title || !platform) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'title og platform er påkrævet' })
      };
    }

    // Platform labels
    const PLATFORM_LABEL = {
      youtube: 'YouTube', netflix: 'Netflix', disney: 'Disney+', dr: 'DR / Ramasjang',
      tv2: 'TV 2 Play', viaplay: 'Viaplay', max: 'Max', hbo: 'Max',
      skyshowtime: 'SkyShowtime', sfkids: 'SF Kids',
      gaming: 'Konsol & PC', switch: 'Nintendo Switch', ipad: 'iPad-apps',
      tiktok: 'TikTok', instagram: 'Instagram', snapchat: 'Snapchat',
      ytshorts: 'YouTube Shorts', bereal: 'BeReal',
      discord: 'Discord', twitch: 'Twitch'
    };

    const platformLabel = PLATFORM_LABEL[platform] || platform;

    // Byg prompten
    let prompt = `Du er en dansk mediepædagogisk ekspert der laver vurderinger til skaermtjek.dk — en forældreguide til digitalt børneindhold.

Vurder: "${title}" på platformen "${platformLabel}"`;

    if (episode) {
      prompt += `\nSpecifikt afsnit: "${episode}"`;
    }
    if (notes) {
      prompt += `\nKontekst fra forælder: "${notes}"`;
    }

    prompt += `

## Din opgave

Generer en komplet dansk vurdering i JSON-format baseret på offentligt tilgængelig viden om titlen. Vær faktabaseret, neutral og konkret.

## Scorer (1-10 skala)

Vurder titlen på 10 kategorier. 1 = ingen/meget lav bekymring, 10 = meget høj bekymring:

- violence — Voldsomt indhold
- language — Sprog & tone
- dopamine — Dopamin & belønning
- retention — Fastholdelse (FOMO, streaks)
- commercialism — Kommercielt pres
- values — Rollemodel (1 = fremragende, 10 = problematisk)
- sexual — Seksuelt indhold
- fear — Skræmmende
- passive — Aktivt vs. passivt (1 = meget aktivt, 10 = rent passivt)
- socialpressure — Socialt pres

## Output (ren JSON uden markdown)

{
  "recommended_age": <heltal 2-18>,
  "age_group": "<0-2|2-4|4-6|7-9|10-12|13+>",
  "ai_scores": {
    "violence": <1-10>, "language": <1-10>, "dopamine": <1-10>,
    "retention": <1-10>, "commercialism": <1-10>, "values": <1-10>,
    "sexual": <1-10>, "fear": <1-10>, "passive": <1-10>, "socialpressure": <1-10>
  },
  "ai_analysis": "<3-5 sætninger på dansk. Start med titlen. Nævn vigtigste positive OG bekymringspunkt. Slut med alders-anbefaling.>",
  "ai_bullets": [
    {"icon": "<emoji>", "highlight": "<1-3 ord>", "text": "<kort beskrivelse, samlet højst 80 tegn>"}
  ],
  "ai_category_texts": {
    "violence": "<2-3 sætninger der forklarer KONKRET hvorfor scoren er som den er>",
    "language": "<samme>", "dopamine": "<samme>", "retention": "<samme>",
    "commercialism": "<samme>", "values": "<samme>", "sexual": "<samme>",
    "fear": "<samme>", "passive": "<samme>", "socialpressure": "<samme>"
  },
  "ai_faq": [
    {"q": "<Spørgsmål>", "a": "<Svar 1-3 sætninger>"}
  ]
}

## Kvalitetskrav

1. Faktabaseret — kun viden du er sikker på
2. Naturligt dansk sprog
3. Konkret — nævn specifikke mekanikker, karakterer, features
4. Balanceret — mindst ét positivt og ét bekymringspunkt
5. 3-5 bullets i ai_bullets, 5 FAQ i ai_faq

## Bullet-ikoner

Brug: ✨ (særligt positivt), 💡 (værdier), 🎨 (kreativ), 🧠 (passivt), 📚 (pædagogisk),
⚔️ (vold), 🗣️ (sprog), 🎰 (dopamin), 🔔 (fastholdelse), 💰 (kommercielt),
🔞 (seksuelt), 😨 (skræmmende), 👥 (socialt pres).

Svar KUN med JSON. Ingen indledning, ingen markdown.`;

    // Kald Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'ANTHROPIC_API_KEY mangler i Netlify' })
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Claude API fejl', details: errorText })
      };
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'JSON parse fejl', raw: text.substring(0, 500) })
      };
    }

    // Returner det berigede indhold
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ratingId: ratingId || null,
        enrichment: parsed
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
