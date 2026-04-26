// netlify/functions/enrich-conversations.js
// FASE 3: Titel-specifikke samtaleoplæg + argumentationshjælp + danske kilder

const DANSKE_KILDER = {
  sundhedsstyrelsen: {
    name: "Sundhedsstyrelsen",
    url: "https://www.sst.dk/da/Udgivelser/2023/Skaermbrug-blandt-boern-og-unge",
    description: "Officielle anbefalinger om skærmtid og børns trivsel",
    topics: ["skærmtid", "søvn", "fysisk aktivitet", "trivsel", "sundhed"]
  },
  medieraadet: {
    name: "Medierådet for Børn og Unge",
    url: "https://medieraadet.dk",
    description: "Officiel aldersmærkning og rådgivning om medier til børn",
    topics: ["aldersmærkning", "film", "spil", "vold", "skræmmende", "PEGI"]
  },
  bornsvilkaar: {
    name: "Børns Vilkår",
    url: "https://bornsvilkaar.dk/digital-trivsel/",
    description: "Rådgivning om digital trivsel og børnetelefon 116 111",
    topics: ["digital trivsel", "mobning", "ensomhed", "sociale medier", "rådgivning"]
  },
  redbarnet: {
    name: "Red Barnet",
    url: "https://redbarnet.dk/vores-arbejde/born-og-digitalt-liv/",
    description: "Online sikkerhed og beskyttelse af børn på nettet",
    topics: ["online sikkerhed", "grooming", "deling af billeder", "krænkelser", "fremmede"]
  },
  digitaldannelse: {
    name: "Center for Digital Dannelse",
    url: "https://digitaldannelse.org",
    description: "Pædagogiske ressourcer om digital dannelse og dialog med børn",
    topics: ["digital dannelse", "dialog", "pædagogik", "kritisk tænkning"]
  },
  sexogsamfund: {
    name: "Sex & Samfund",
    url: "https://sexogsamfund.dk/undervisningsmateriale",
    description: "Materiale om seksualitet, kroppen og medier til forældre og børn",
    topics: ["seksualitet", "krop", "kønsroller", "porno", "samtykke"]
  },
  taenk: {
    name: "Forbrugerrådet Tænk",
    url: "https://taenk.dk/test-og-forbrugerliv/digital",
    description: "Tests og rådgivning om apps, abonnementer og forbrugerbeskyttelse",
    topics: ["apps", "abonnementer", "kommercielt pres", "in-app køb", "reklamer"]
  },
  datatilsynet: {
    name: "Datatilsynet",
    url: "https://www.datatilsynet.dk/borger/boern-og-unge",
    description: "Privatliv, persondata og børns rettigheder på nettet",
    topics: ["persondata", "privatliv", "data", "GDPR", "samtykke", "tracking"]
  },
  cyberhus: {
    name: "Cyberhus",
    url: "https://cyberhus.dk",
    description: "Anonym chatrådgivning til børn og unge",
    topics: ["chat-rådgivning", "ung-til-ung", "anonym hjælp", "psykisk velvære"]
  }
};

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
    const { title, platform, episode, manualContext, ai_scores, recommended_age, ratingId } = JSON.parse(event.body);
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

    // Identificer om dette er et socialt medie eller andet pres-følsomt indhold
    const socialMediaPlatforms = ['tiktok', 'instagram', 'snapchat', 'bereal', 'discord', 'ytshorts'];
    const isSocialMedia = socialMediaPlatforms.includes(platform);
    const hasHighSocialPressure = ai_scores?.socialpressure >= 6 || ai_scores?.commercialism >= 6;
    const includeCounterarguments = isSocialMedia || hasHighSocialPressure;

    const platformLabel = PLATFORM_LABEL[platform] || platform;

    // Liste af kilde-IDs som AI kan vælge fra
    const kildeIds = Object.keys(DANSKE_KILDER).join(', ');
    const contextLine = manualContext ? `\n\nVIGTIG KONTEKST FRA ADMIN (verificeret): ${manualContext}\n` : '';

    const prompt = `"${title}" (${platformLabel})${episode ? ' - ' + episode : ''}. Anbefalet ${recommended_age || '?'} år.${contextLine}

Generer dansk samtale-indhold til forældre i JSON:

{
"questions": [
  {"q": "<spørgsmål til barnet>", "context": "<hvorfor stille det>"},
  {"q": "<spørgsmål til barnet>", "context": "<hvorfor stille det>"},
  {"q": "<spørgsmål til barnet>", "context": "<hvorfor stille det>"}
],${includeCounterarguments ? `
"counterarguments": [
  {"child_says": "<typisk barnemodargument>", "parent_response": "<konkret konstruktivt svar>"},
  {"child_says": "<typisk barnemodargument>", "parent_response": "<konkret konstruktivt svar>"},
  {"child_says": "<typisk barnemodargument>", "parent_response": "<konkret konstruktivt svar>"}
],` : ''}
"sources": ["<kilde_id_1>", "<kilde_id_2>"]
}

KRAV:
- Spørgsmål er KONKRETE og refererer til titlens specifikke indhold (karakterer, mekanikker, situationer). Ikke generiske.
- ${includeCounterarguments ? 'Counterarguments: Realistiske ting børn siger ("alle andre har det", "jeg misser ud", "jeg er gammel nok"), med konkrete forældre-svar der anerkender følelsen men holder rammer.' : 'Drop counterarguments - ikke nødvendigt her.'}
- Sources: Vælg 2-3 mest relevante danske kilder fra denne liste: ${kildeIds}

Eksempler på konkrete spørgsmål:
- Fortnite: "Hvad får dig til at fortsætte med at spille efter en runde?"
- Gurli Gris: "Hvem af Gurli Gris' venner minder mest om dine venner?"

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
        max_tokens: 1500,
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

    // Berig sources med faktiske URLs fra databasen
    if (parsed.sources && Array.isArray(parsed.sources)) {
      parsed.sources = parsed.sources
        .map(id => DANSKE_KILDER[id])
        .filter(s => s); // Fjern ugyldige IDs
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, ratingId: ratingId || null, enrichment: { ai_conversations: parsed } })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
