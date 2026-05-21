// netlify/functions/social-post-generator.js
// Tager rating-data via POST og genererer 3 social media-formater:
// 1. Vurdering (Instagram/Facebook hovedpost)
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
      formats = ['vurdering', 'uge_tip', 'heads_up']
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

    // SkærmTjeks AI-redaktion. Skribenten vælges efter platform-kategori,
    // så opslaget skrives i den stemme der passer til indholdstypen.
    const EDITORS = {
      'RØD': {
        emoji: '🎬',
        role: 'film- og serie-anmelder',
        voice: 'Tager stilling. Skriver skarpt, klart og ærligt — aldrig "lidt godt og lidt dårligt". Tåler ikke upræcist sprog.'
      },
      'CACHE': {
        emoji: '🎮',
        role: 'tekniske reviewer for spil og apps',
        voice: 'Datadreven og præcis. Konkret om in-app-køb, chat-funktioner og aldersmærkning. Ingen svæveri.'
      },
      'PEER': {
        emoji: '👥',
        role: 'faktatjekker med fokus på sociale medier',
        voice: 'Empatisk og jordnær. Siger "det er mere nuanceret end det". Taler til forældre i øjenhøjde om TikTok, Snapchat, Instagram.'
      },
      'ALF': {
        emoji: '🌱',
        role: 'chefredaktør med pædagogisk fokus på de mindste',
        voice: 'Pædagogisk skarp, varm men nøgtern. Trækker på Sundhedsstyrelsen, Medierådet og Børns Vilkår.'
      }
    };

    // Map platform → skribent
    const PLATFORM_EDITOR = {
      youtube: 'RØD', netflix: 'RØD', disney: 'RØD', dr: 'RØD',
      tv2: 'RØD', viaplay: 'RØD', max: 'RØD', hbo: 'RØD',
      skyshowtime: 'RØD', sfkids: 'RØD', cinema: 'RØD',
      gaming: 'CACHE', switch: 'CACHE', ipad: 'CACHE', mobile_apps: 'CACHE',
      tiktok: 'PEER', instagram: 'PEER', snapchat: 'PEER',
      ytshorts: 'PEER', bereal: 'PEER', discord: 'PEER',
      twitch: 'PEER', pinterest: 'PEER'
    };

    // Vælg skribent — ALF som fallback (de mindste / ukendt platform)
    let editorKey = PLATFORM_EDITOR[rating.platform] || 'ALF';
    const ageStr = String(rating.recommended_age || '');
    const ageNum = parseInt(ageStr, 10);
    if (!isNaN(ageNum) && ageNum <= 3) {
      editorKey = 'ALF';
    }
    const editor = EDITORS[editorKey];

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
    // VIGTIG TONE: Vi GIVER VURDERINGER, vi ANBEFALER IKKE.
    const signatureLine = `— Vurderet af ${editorKey} ${editor.emoji}, ${editorKey} er ${editor.role} i SkærmTjeks AI-redaktion. Alt indhold tjekkes af redaktionen og et menneske før det udgives.`;

    const FORMAT_PROMPTS = {
      vurdering: `Skriv et Facebook/Instagram-opslag der formidler vores vurdering af titlen.

Struktur:
${editor.emoji} [TITEL]
[Hook-sætning der fanger opmærksomhed — konkret, ikke en anbefaling, ikke en cliche]

[2-3 korte sætninger: hvad det er, hvad der fungerer, og hvad man skal være opmærksom på. Konkret og ærligt.]

✓ Vejledende fra [alder] år
[Værdi-tags hvis relevante, adskilt af •]

📊 AI: X.X / Forældre: X.X (eller "Ingen forældrescore endnu")

👉 Læs hele vurderingen på skaermtjek.dk

${signatureLine}

Krav:
- MAX 150 ord (ekskl. signatur)
- Konkret hverdagsdansk — som vores blog-artikler, ikke som markedsføring
- Ingen blomstrende ord eller opfundne sammensætninger
- Skriv aldrig "anbefaler/anbefaling/anbefalet"
- Emojis sparsomt (max 3 i selve teksten)
- Et grundlag for forældrenes samtale — ikke et facit`,

      uge_tip: `Skriv en kort Instagram Stories-tekst.

Struktur:
🌟 Ugens familiefund
"[Titel]"

Tre ting du skal vide:
• [Punkt 1 — konkret]
• [Punkt 2 — konkret]
• [Punkt 3 — konkret]

→ skaermtjek.dk

${signatureLine}

Krav:
- MAX 80 ord i selve teksten (ekskl. signatur)
- Skarpt og direkte — læses på 5 sekunder
- Konkret dansk, ingen klicheer
- Brug aldrig "anbefaling/anbefaler"
- Ingen høflighedsfraser`,

      heads_up: `Skriv et Facebook-opslag der lyder som en forælder der deler en heads-up med andre forældre.

Struktur:
👀 Forældre-tjek: [Titel]

Er dit barn begyndt at snakke om [titel]?

Her er hvad I skal vide:
[Kort, konkret sammendrag af hvad det er]

✅ Det kan være godt fordi: [konkret styrke]
⚠️ Vær opmærksom på: [konkret bekymring]

Vurderingen findes på skaermtjek.dk

${signatureLine}

Krav:
- Lyd som en forælder der taler til andre forældre — ikke som en ekspert
- Konkret og brugbar, almindeligt talesprog
- Ingen blomstrende ord
- Brug aldrig "anbefale/anbefaling"
- Information mellem ligeværdige — ikke autoritet til underordnet`
    };

    const systemPrompt = `Du skriver sociale medie-opslag for SkærmTjek.dk — en dansk forældreguide til børns digitale indhold.

DU SKRIVER SOM: ${editorKey} ${editor.emoji}, ${editor.role} i SkærmTjeks AI-redaktion.
${editorKey}'s stemme: ${editor.voice}

VORES PRINCIPPER:
- Vi GIVER VURDERINGER, vi ANBEFALER IKKE. Vi er et grundlag for forældrenes samtale — ikke et facit.
- AI- og forældrescores er ligeværdige.
- Data over moral. Ingen pegefinger. Ingen mediepanik.
- Vi anerkender at børn ER online — vi hjælper med at navigere.
- Dansksproget indhold og dansk perspektiv er kernen.

SÅDAN SKRIVER SKÆRMTJEK (afgørende — læs grundigt):
Vores tekster er konkrete, jordnære og ærlige. Vi taler til forælderen som et voksent menneske.
Korte, rene sætninger. Almindeligt dansk som folk faktisk taler.

SKRIV SÅDAN HER (eksempler på vores rigtige tone):
- "Det er ikke skærmtid der er problemet. Det er skærmtidens kvalitet."
- "En mor som klokken 17.30 står med en træt 6-årig der vil se noget Disney, har ikke tid til at læse en metaanalyse."
- "Lad os være ærlige: der er for mange Far til Fire-film. Nogle er bedre end andre."
- "Den vil gøre dine børn kede af det. Men den vil også gøre dem klogere."

SKRIV ALDRIG SÅDAN (forbudt — det lyder som en AI der prøver for hårdt):
- Blomstrende klicheer: "en reklamefri oase", "et magisk univers", "fra dag ét", "en verden af muligheder"
- Opfundne sammensatte ord: "voksenstyrke", "voksenmedvirken", "videostrømning", "skærmkonsumption"
- Markedsføringssprog: "uden kommercielt besvær", "dyrebar indhold", "kulturelle referencer fra dag ét"
- Stive vendinger ingen dansker bruger i tale

TJEK DIG SELV FØR DU SVARER (intern redaktionel gennemgang):
Inden du returnerer teksten, gennemgå den som om RØD (sprog) og PEER (fakta) læste den:
1. RØD: Er der blomstrende ord, klicheer eller opfundne sammensætninger? Fjern dem. Lyder hver sætning som noget en dansk forælder ville sige højt? Hvis ikke — skriv om.
2. PEER: Påstår teksten noget der ikke står i vurdering-dataen? Fjern det. Hold dig til fakta fra dataen.
3. Står ordet "anbefal..." nogen steder? Fjern det.
Returnér først teksten når den ville bestå dette tjek.

ABSOLUT TONE-REGEL:
Brug ALDRIG ordene "anbefaler", "anbefaling" eller "anbefalet".
Brug i stedet: "vi har vurderet", "vurdering", "vejledende fra X år", "fundet egnet til",
"kan være et godt valg hvis", "fund", "tip", "vi har set".

Returnér KUN selve opslagsteksten — ingen indledning, ingen forklaring, ingen markdown, ingen anførselstegn omkring det hele.`;

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
        editor: {
          key: editorKey,
          emoji: editor.emoji,
          role: editor.role
        },
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
