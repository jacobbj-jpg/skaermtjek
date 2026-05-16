// netlify/functions/social-post-generator.js
// Tager rating-data via POST og genererer 3 social media-formater:
// 1. Anbefaling (Instagram/Facebook hovedpost)
// 2. Uge-tip (Stories/kort post)
// 3. Heads up (Facebook gruppe-stil)
//
// Følger samme stateless-mønster som enrich.js — modtager data fra caller,
// returnerer JSON-resultat. Ingen Supabase-integration her.
// Caller (Make.com eller browser) henter rating fra Supabase først.

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      rating,           // Hele rating-objektet fra Supabase
      formats = ['anbefaling', 'uge_tip', 'heads_up']
    } = body;

    if (!rating || !rating.title) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'rating-objekt med mindst title er påkrævet' })
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'ANTHROPIC_API_KEY mangler' })
      };
    }

    const PLATFORM_LABEL = {
      youtube: 'YouTube', netflix: 'Netflix', disney: 'Disney+', dr: 'DR',
      tv2: 'TV 2 Play', viaplay: 'Viaplay', max: 'Max', hbo: 'Max',
      skyshowtime: 'SkyShowtime', sfkids: 'SF Kids',
      gaming: 'Konsol/PC', switch: 'Nintendo Switch', ipad: 'iPad',
      mobile_apps: 'Mobil-app', cinema: 'Biograf',
      tiktok: 'TikTok', instagram: 'Instagram', snapchat: 'Snapchat',
      ytshorts: 'YouTube Shorts', bereal: 'BeReal',
      discord: 'Discord', twitch: 'Twitch', pinterest: 'Pinterest'
    };

    // Forbered data til AI
    const aiScoresAvg = rating.ai_scores
      ? (Object.values(rating.ai_scores).reduce((a, b) => a + b, 0) / Object.values(rating.ai_scores).length).toFixed(1)
      : null;

    const ratingData = {
      title: rating.title,
      platform: PLATFORM_LABEL[rating.platform] || rating.platform || 'Ukendt platform',
      aiScore: aiScoresAvg,
      parentScore: rating.parent_score,
      parentVotes: rating.parent_votes || 0,
      recommendedAge: rating.recommended_age,
      bullets: rating.ai_bullets || [],
      analysis: rating.ai_analysis ? rating.ai_analysis.slice(0, 500) : null,
      positiveTags: rating.positive_tags || [],
      contentType: rating.content_type || 'channel',
      notes: rating.notes ? rating.notes.slice(0, 200) : null
    };

    // Format-specifikke prompts
    const FORMAT_PROMPTS = {
      anbefaling: `Generer et Instagram/Facebook-opslag der anbefaler titlen.

Format:
🎬 [TITEL]
[Hook-sætning der fanger opmærksomhed]

[2-3 sætninger om hvad det er og hvorfor det er værd at se]

✓ [Aldersanbefaling]
[Værdi-tags hvis relevante]

📊 AI: X.X / Forældre: X.X (eller "Ingen forældrescore endnu")

👉 Læs hele vurderingen på skaermtjek.dk

Krav:
- Skal være under 150 ord
- Hverdagsdansk, ingen fagsprog
- Anerkend at børn ER online — vi hjælper navigere
- Brug emojis sparsomt`,

      uge_tip: `Generer en kort Instagram Stories-tekst (3-4 linjer max).

Format:
🌟 Ugens familieanbefaling
"[Titel]"

Tre ting du skal vide:
• [Punkt 1]
• [Punkt 2]
• [Punkt 3]

→ skaermtjek.dk

Krav:
- MAX 80 ord total
- Skarpt og direkte — det skal læses på 5 sekunder
- Ingen unødvendige høflighedsfraser`,

      heads_up: `Generer et Facebook-gruppestil opslag der lyder som en forælder
der deler en heads-up med andre forældre.

Format:
👀 Forældre-tjek: [Titel]

Er dit barn begyndt at snakke om [titel]?

Her er hvad I skal vide:
[Kort sammendrag af hvad det er]

✅ Det er godt fordi: [styrke]
⚠️ Vær opmærksom på: [bekymring]

Vurderingen findes på skaermtjek.dk

Krav:
- Lyd som en forælder — ikke en ekspert
- Tag forældrenes side
- Vær konkret og brugbar`
    };

    const systemPrompt = `Du er social media-redaktør for SkærmTjek.dk.

Vores principper:
- AI- og forældrescores er ligeværdige
- Vi modvirker mediepanik og dømmende sprog
- Vi anerkender at børn ER online
- Vi er transparente om AI-genereret indhold
- Vi prioriterer dansk indhold og dansk perspektiv

Returnér KUN selve teksten — ingen indledning, ingen forklaring, ingen markdown.`;

    // Generer alle formater parallelt med Promise.all for hastighed
    const generationPromises = formats.map(async (formatKey) => {
      const formatPrompt = FORMAT_PROMPTS[formatKey];
      if (!formatPrompt) {
        return { format: formatKey, text: `[FEJL: Ukendt format "${formatKey}"]`, error: true };
      }

      const fullPrompt = `${formatPrompt}

VURDERING-DATA:
${JSON.stringify(ratingData, null, 2)}`;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 600,
            system: systemPrompt,
            messages: [{ role: 'user', content: fullPrompt }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          return { format: formatKey, text: `[FEJL: Claude API ${response.status}]`, error: true, details: errorText };
        }

        const data = await response.json();
        const text = (data.content?.map(c => c.text || '').join('') || '').trim();
        return { format: formatKey, text };
      } catch (err) {
        return { format: formatKey, text: `[FEJL: ${err.message}]`, error: true };
      }
    });

    const results = await Promise.all(generationPromises);

    // Saml resultater til et objekt
    const posts = {};
    results.forEach(r => { posts[r.format] = r.text; });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        title: rating.title,
        posts,
        metadata: {
          platform: rating.platform,
          aiAvg: aiScoresAvg,
          contentType: rating.content_type,
          recommendedAge: rating.recommended_age,
          tags: rating.positive_tags
        }
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
