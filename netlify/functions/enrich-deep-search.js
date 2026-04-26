// netlify/functions/enrich-deep-search.js
// DEEP MODE: Bruger Claude's web_search tool til at finde fakta før generering
// Bruges KUN til prioriterede titler hvor vi vil have faktabaseret indhold
// Cost: ~14 øre per call ($10 per 1000 web searches)

const DANSKE_KILDER = {
  sundhedsstyrelsen: { name: "Sundhedsstyrelsen", url: "https://www.sst.dk/da/Udgivelser/2023/Skaermbrug-blandt-boern-og-unge", description: "Officielle anbefalinger om skærmtid og børns trivsel", topics: ["skærmtid", "søvn", "trivsel"] },
  medieraadet: { name: "Medierådet for Børn og Unge", url: "https://medieraadet.dk", description: "Officiel aldersmærkning og rådgivning om medier til børn", topics: ["aldersmærkning", "film", "spil", "vold"] },
  bornsvilkaar: { name: "Børns Vilkår", url: "https://bornsvilkaar.dk/digital-trivsel/", description: "Rådgivning om digital trivsel og børnetelefon 116 111", topics: ["digital trivsel", "mobning", "ensomhed"] },
  redbarnet: { name: "Red Barnet", url: "https://redbarnet.dk/vores-arbejde/born-og-digitalt-liv/", description: "Online sikkerhed og beskyttelse af børn på nettet", topics: ["online sikkerhed", "grooming"] },
  digitaldannelse: { name: "Center for Digital Dannelse", url: "https://digitaldannelse.org", description: "Pædagogiske ressourcer om digital dannelse", topics: ["digital dannelse", "dialog"] },
  sexogsamfund: { name: "Sex & Samfund", url: "https://sexogsamfund.dk/undervisningsmateriale", description: "Materiale om seksualitet og medier", topics: ["seksualitet", "krop", "porno"] },
  taenk: { name: "Forbrugerrådet Tænk", url: "https://taenk.dk/test-og-forbrugerliv/digital", description: "Tests og rådgivning om apps og forbrugerbeskyttelse", topics: ["apps", "abonnementer", "in-app køb"] },
  datatilsynet: { name: "Datatilsynet", url: "https://www.datatilsynet.dk/borger/boern-og-unge", description: "Privatliv og børns rettigheder på nettet", topics: ["persondata", "privatliv", "GDPR"] },
  cyberhus: { name: "Cyberhus", url: "https://cyberhus.dk", description: "Anonym chatrådgivning til børn og unge", topics: ["chat-rådgivning", "anonym hjælp"] }
};

const PLATFORM_LABEL = {
  youtube: 'YouTube', netflix: 'Netflix', disney: 'Disney+', dr: 'DR', tv2: 'TV 2 Play',
  viaplay: 'Viaplay', max: 'Max', hbo: 'Max', skyshowtime: 'SkyShowtime', sfkids: 'SF Kids',
  gaming: 'Konsol/PC', switch: 'Nintendo Switch', ipad: 'iPad', tiktok: 'TikTok',
  instagram: 'Instagram', snapchat: 'Snapchat', ytshorts: 'YouTube Shorts', bereal: 'BeReal',
  discord: 'Discord', twitch: 'Twitch'
};

function buildFastPrompt(title, platform, episode, ai_scores, recommended_age, manualContext) {
  const platformLabel = PLATFORM_LABEL[platform] || platform;
  return `Du er researchassistent for SkærmTjek, en dansk forældre-guide. Lav en DYBDEGÅENDE og FAKTABASERET vurdering af "${title}" (${platformLabel})${episode ? ' - ' + episode : ''}.

INSTRUKTIONER:
1. Brug web search til at finde dansk presse-dækning, kontroverser, klager, kritik, eller offentlige debatter om titlen
2. Find producent, udgivelsesår, målgruppe og særlige karakteristika
3. Find konkrete eksempler på indhold der kan bekymre eller glæde forældre
4. Hvis det er en dansk titel, prioriter danske kilder (DR, TV2, Berlingske, Politiken, Information, Kristeligt Dagblad)

${manualContext ? `KRITISK KONTEKST FRA ADMIN:
${manualContext}

Denne kontekst er VERIFICERET og skal vægtes højt i analysen.

` : ''}MANUELLE SCORES (allerede sat af admin, RESPEKTÉR DEM):
${JSON.stringify(ai_scores)}
Anbefalet alder: ${recommended_age}

Generer dette JSON (kun JSON, ingen kommentarer):
{
"ai_bullets": [
  "<konkret positiv pointe baseret på research>",
  "<konkret positiv pointe>",
  "<konkret bekymring som matcher de høje scores>",
  "<konkret bekymring>"
],
"ai_analysis": "<200-280 ord faktabaseret analyse på dansk. Inkluder konkrete navne, årstal, og verificerbare fakta. Forklar hvorfor scorerne er som de er. Skriv som en informeret forælder, ikke som en marketing-tekst. Brug specifikke eksempler fra research.>",
"sources": ["<URL1>", "<URL2>"]
}`;
}

function buildDeepPrompt(title, platform, episode, ai_scores, recommended_age, manualContext) {
  const platformLabel = PLATFORM_LABEL[platform] || platform;
  return `Du er researchassistent for SkærmTjek. Generer DYBDEGÅENDE per-kategori tekster og FAQ for "${title}" (${platformLabel})${episode ? ' - ' + episode : ''}.

INSTRUKTIONER:
1. Brug web search hvis du ikke kender titlen godt, eller hvis det er en dansk titel
2. Find konkrete eksempler i hver bekymringskategori
3. Vær specifik med navne, episoder, situationer

${manualContext ? `KRITISK KONTEKST FRA ADMIN:
${manualContext}

` : ''}SCORES (skal MATCHE teksterne):
${JSON.stringify(ai_scores)}
Anbefalet alder: ${recommended_age}

Generer JSON:
{
"ai_category_texts": {
  "violence": "<2-3 sætninger om vold-niveau med konkrete eksempler. Match score ${ai_scores.violence}/10.>",
  "language": "<2-3 sætninger om sprog-niveau med konkrete eksempler. Match score ${ai_scores.language}/10.>",
  "dopamine": "<2-3 sætninger om dopamin-elementer. Match ${ai_scores.dopamine}/10.>",
  "retention": "<2-3 sætninger om vanedannelse. Match ${ai_scores.retention}/10.>",
  "commercialism": "<2-3 sætninger om kommercielt pres. Match ${ai_scores.commercialism}/10.>",
  "values": "<2-3 sætninger om rollemodel/værdier. Match ${ai_scores.values}/10.>",
  "sexual": "<2-3 sætninger om seksuelt indhold. Match ${ai_scores.sexual}/10.>",
  "fear": "<2-3 sætninger om skræmmende indhold. Match ${ai_scores.fear}/10.>",
  "passive": "<2-3 sætninger om passivt forbrug. Match ${ai_scores.passive}/10.>",
  "socialpressure": "<2-3 sætninger om socialt pres. Match ${ai_scores.socialpressure}/10.>"
},
"ai_faq": [
  {"q": "<typisk forældrespørgsmål>", "a": "<konkret svar baseret på research>"},
  {"q": "<typisk forældrespørgsmål>", "a": "<konkret svar>"},
  {"q": "<typisk forældrespørgsmål>", "a": "<konkret svar>"}
]
}

Kun JSON.`;
}

function buildConversationsPrompt(title, platform, episode, ai_scores, recommended_age, manualContext) {
  const platformLabel = PLATFORM_LABEL[platform] || platform;
  const socialMediaPlatforms = ['tiktok', 'instagram', 'snapchat', 'bereal', 'discord', 'ytshorts'];
  const isSocialMedia = socialMediaPlatforms.includes(platform);
  const hasHighSocialPressure = ai_scores?.socialpressure >= 6 || ai_scores?.commercialism >= 6;
  const includeCounterarguments = isSocialMedia || hasHighSocialPressure;
  const kildeIds = Object.keys(DANSKE_KILDER).join(', ');

  return `Generer dansk samtale-indhold for "${title}" (${platformLabel}) i JSON, med web search hvis nødvendigt for konkrete eksempler.

${manualContext ? `KRITISK KONTEKST: ${manualContext}\n\n` : ''}Anbefalet alder: ${recommended_age}. Scores: ${JSON.stringify(ai_scores)}.

JSON:
{
"questions": [
  {"q": "<konkret titel-specifikt spørgsmål>", "context": "<hvorfor>"},
  {"q": "<konkret>", "context": "<hvorfor>"},
  {"q": "<konkret>", "context": "<hvorfor>"}
],${includeCounterarguments ? `
"counterarguments": [
  {"child_says": "<typisk barneargument>", "parent_response": "<konkret svar>"},
  {"child_says": "<typisk>", "parent_response": "<konkret>"},
  {"child_says": "<typisk>", "parent_response": "<konkret>"}
],` : ''}
"sources": ["<kilde_id>", "<kilde_id>"]
}

Sources: vælg 2-3 fra: ${kildeIds}. Kun JSON.`;
}

async function callClaudeWithSearch(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 2  // Reduceret fra 3 til 2 for at undgå timeout
      }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Claude API fejl: ' + errorText.substring(0, 300));
  }

  const data = await response.json();

  // Saml al tekst fra response (kan være blandet med tool_use blokke)
  const text = data.content
    ?.filter(c => c.type === 'text')
    ?.map(c => c.text || '')
    ?.join('') || '';

  // Saml URLs fra web search citations hvis tilgængelige
  const sources = [];
  data.content?.forEach(c => {
    if (c.type === 'web_search_tool_result' && Array.isArray(c.content)) {
      c.content.forEach(r => { if (r.url) sources.push(r.url); });
    }
  });

  return { text, sources };
}

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
    const body = JSON.parse(event.body);
    const { phase, title, platform, episode, ai_scores, recommended_age, manualContext, ratingId } = body;

    if (!title || !platform) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'title og platform er påkrævet' }) };
    }
    if (!phase) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'phase er påkrævet (fast/deep/conversations)' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY mangler' }) };

    // Vælg prompt baseret på fase
    let prompt;
    if (phase === 'fast') {
      prompt = buildFastPrompt(title, platform, episode, ai_scores || {}, recommended_age, manualContext);
    } else if (phase === 'deep') {
      prompt = buildDeepPrompt(title, platform, episode, ai_scores || {}, recommended_age, manualContext);
    } else if (phase === 'conversations') {
      prompt = buildConversationsPrompt(title, platform, episode, ai_scores || {}, recommended_age, manualContext);
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'ugyldig phase' }) };
    }

    const { text, sources } = await callClaudeWithSearch(apiKey, prompt);

    // Parse JSON fra Claude's svar
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      // Find første { og sidste } for at trimme evt. forklarende tekst
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      const jsonStr = (start >= 0 && end > start) ? clean.substring(start, end + 1) : clean;
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'JSON parse fejl', raw: text.substring(0, 800) }) };
    }

    // For conversations: berig sources med faktiske URLs fra danske kilder
    if (phase === 'conversations' && parsed.sources && Array.isArray(parsed.sources)) {
      parsed.sources = parsed.sources
        .map(id => DANSKE_KILDER[id])
        .filter(s => s);
    }

    // Tilføj web search sources (ud over Claude's egne) for transparency
    if (sources.length > 0 && phase === 'fast') {
      parsed.sources = sources.slice(0, 5);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ratingId: ratingId || null,
        enrichment: phase === 'fast' ? parsed
                  : phase === 'deep' ? parsed
                  : { ai_conversations: parsed }
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
