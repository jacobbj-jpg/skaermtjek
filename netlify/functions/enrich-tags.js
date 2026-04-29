// netlify/functions/enrich-tags.js
// FASE 4: Positive værdi-tags
// Tilskriver hver titel 0-3 værdi-tags fra et fast vokabular
// Bruges til positiv filtrering på forsiden

const POSITIVE_TAGS = {
  laering: {
    id: 'laering',
    name: 'Læring',
    icon: '🌱',
    description: 'Indhold der giver barnet konkret viden eller færdigheder (sprog, tal, natur, historie, samfund)'
  },
  kreativitet: {
    id: 'kreativitet',
    name: 'Kreativitet',
    icon: '🎨',
    description: 'Inspirerer til at bygge, tegne, skabe, eksperimentere — gerne væk fra skærmen bagefter'
  },
  aktiv: {
    id: 'aktiv',
    name: 'Aktiv',
    icon: '🏃',
    description: 'Lægger op til fysisk bevægelse eller leg (dans, sport, gulvet-er-lava-stil indhold)'
  },
  socialt: {
    id: 'socialt',
    name: 'Socialt & empati',
    icon: '🤝',
    description: 'Fokuserer på venskab, følelser, konflikthåndtering, det at være en god kammerat'
  },
  fordybelse: {
    id: 'fordybelse',
    name: 'Fordybelse',
    icon: '🧩',
    description: 'Kræver koncentration og ro, modvægt til hurtig dopamin (langsom fortælling, problemløsning, eftertænksomhed)'
  }
};

const PLATFORM_LABEL = {
  youtube: 'YouTube', netflix: 'Netflix', disney: 'Disney+', dr: 'DR', tv2: 'TV 2 Play',
  viaplay: 'Viaplay', max: 'Max', skyshowtime: 'SkyShowtime', sfkids: 'SF Kids',
  apple: 'Apple TV+', prime: 'Prime Video', film_tv: 'Film og TV',
  gaming: 'Konsol/PC', switch: 'Nintendo Switch', mobile_apps: 'Mobil-apps',
  tiktok: 'TikTok', instagram: 'Instagram', snapchat: 'Snapchat',
  ytshorts: 'YouTube Shorts', bereal: 'BeReal',
  discord: 'Discord', twitch: 'Twitch'
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { title, platform, episode, ai_scores, recommended_age, ratingId } = JSON.parse(event.body);
    if (!title || !platform) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'title og platform er påkrævet' }) };
    }

    const platformLabel = PLATFORM_LABEL[platform] || platform;

    // Liste af tag-IDs som AI kan vælge fra
    const tagDescriptions = Object.values(POSITIVE_TAGS)
      .map(t => `- "${t.id}" (${t.name}): ${t.description}`)
      .join('\n');

    const prompt = `"${title}" (${platformLabel})${episode ? ' - ' + episode : ''}. Anbefalet ${recommended_age || '?'} år.

Tildel 0-3 positive værdi-tags som beskriver hvad denne titel TILBYDER positivt for et barn. Vælg KUN tags der virkelig matcher — det er bedre at tildele 1 stærk tag end 3 svage.

Tilgængelige tags:
${tagDescriptions}

VIGTIGT:
- Vælg KUN tags der oplagt passer. Hvis intet passer, returner tom array []
- Sociale medier (TikTok, Snapchat, Instagram) får sjældent positive tags — kun hvis specifikt indhold matcher (fx Duolingo har "laering")
- Ren underholdning uden læring/kreativitet får måske 0 tags (ikke et minus)
- Et spil som Minecraft kunne få "kreativitet" + "fordybelse"
- Bluey kunne få "socialt"
- En matematikapp kunne få "laering"

Returner KUN JSON i dette format (ingen kommentarer):
{
  "positive_tags": ["tag_id_1", "tag_id_2"],
  "reasoning": "<kort dansk forklaring på max 1 sætning>"
}`;

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API fejl', details: errorText.substring(0, 300) }) };
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      const jsonStr = (start >= 0 && end > start) ? clean.substring(start, end + 1) : clean;
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'JSON parse fejl', raw: text.substring(0, 400) }) };
    }

    // Valider: positive_tags skal være array af kendte tag-IDs
    if (!Array.isArray(parsed.positive_tags)) {
      parsed.positive_tags = [];
    }
    parsed.positive_tags = parsed.positive_tags
      .filter(id => POSITIVE_TAGS[id]) // kun kendte tags
      .slice(0, 3); // maks 3

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ratingId: ratingId || null,
        enrichment: {
          positive_tags: parsed.positive_tags,
          tags_reasoning: parsed.reasoning || null
        }
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
