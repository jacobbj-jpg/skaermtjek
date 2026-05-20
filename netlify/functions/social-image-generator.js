// netlify/functions/social-image-generator.js
// Genererer SVG-cards baseret på rating-data + format,
// konverterer til PNG med @resvg/resvg-js, og returnerer PNG som base64.
// Tre formater:
// - vurdering: 1080x1080 (Instagram/Facebook feed)
// - uge_tip: 1080x1920 (Instagram Stories)
// - heads_up: 1080x1080 (Facebook gruppe-stil)
//
// Output:
//   - png_base64: PNG-billede som base64-streng (klar til Make.com)
//   - svg: rå SVG-kode (beholdt for debugging)

const { Resvg } = require('@resvg/resvg-js');
const path = require('path');

// Find stierne til Inter-font-filer fra @fontsource/inter npm-pakken.
// Pakken indeholder .ttf-filer i undermappen "files".
// Vi loader regular (400) + bold (700) så både brødtekst og overskrifter renderes.
function resolveFontFiles() {
  const fontFiles = [];
  try {
    const interDir = path.dirname(require.resolve('@fontsource/inter/package.json'));
    const candidates = [
      'files/inter-latin-400-normal.woff', // bruges ikke af resvg, men nævnt for klarhed
      'files/inter-latin-400-normal.ttf',
      'files/inter-latin-700-normal.ttf'
    ];
    for (const rel of candidates) {
      if (rel.endsWith('.ttf')) {
        fontFiles.push(path.join(interDir, rel));
      }
    }
  } catch (e) {
    // Hvis pakken ikke kan findes, returneres tom liste —
    // resvg falder så tilbage til system-fonte.
  }
  return fontFiles;
}

const FONT_FILES = resolveFontFiles();

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
    const { rating, format = 'vurdering' } = body;

    if (!rating || !rating.title) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'rating-objekt med mindst title er påkrævet' })
      };
    }

    // Forbered data
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

    const aiScoresAvg = rating.ai_scores
      ? (Object.values(rating.ai_scores).reduce((a, b) => a + b, 0) / Object.values(rating.ai_scores).length).toFixed(1)
      : null;

    const data = {
      title: rating.title,
      platform: PLATFORM_LABEL[rating.platform] || rating.platform || '',
      aiScore: aiScoresAvg,
      parentScore: rating.parent_score ? Number(rating.parent_score).toFixed(1) : null,
      parentVotes: rating.parent_votes || 0,
      age: rating.recommended_age,
      tags: (rating.positive_tags || []).slice(0, 3),
      bullets: rating.ai_bullets || []
    };

    // Vælg generator baseret på format
    let svg;
    switch (format) {
      case 'vurdering':
        svg = generateVurderingCard(data);
        break;
      case 'uge_tip':
        svg = generateUgeTipCard(data);
        break;
      case 'heads_up':
        svg = generateHeadsUpCard(data);
        break;
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Ukendt format: ${format}` })
        };
    }

    const dims = getDimensions(format);

    // Konverter SVG → PNG med resvg
    let pngBase64 = null;
    let conversionError = null;
    try {
      const resvg = new Resvg(svg, {
        fitTo: {
          mode: 'width',
          value: dims.width
        },
        font: {
          // Load Inter-font-filer bundlet via @fontsource/inter npm-pakken.
          fontFiles: FONT_FILES,
          // Undgå at lede efter system-fonte (de findes ikke pålideligt på Netlify).
          loadSystemFonts: false,
          // SVG'en bruger generiske keywords (sans-serif/serif) —
          // begge peger nu på Inter.
          defaultFontFamily: 'Inter',
          serifFamily: 'Inter',
          sansSerifFamily: 'Inter'
        }
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();
      pngBase64 = pngBuffer.toString('base64');
    } catch (convErr) {
      conversionError = convErr.message;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        format,
        title: rating.title,
        png_base64: pngBase64,
        png_conversion_error: conversionError,
        font_files_found: FONT_FILES.length,
        svg,
        dimensions: dims
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

// ──────────────────────────────────────────────
// BRAND-FARVER (fra SkærmTjek index.html)
// ──────────────────────────────────────────────
const COLORS = {
  cream: '#faf7f2',
  warm: '#f0ead8',
  ink: '#1a1714',
  ink2: '#3d3830',
  muted: '#9a9186',
  border: '#e0d8cc',
  accent: '#c85a2a',      // Orange — hovedaccent
  accent2: '#2a7a5c',     // Grøn
  accent3: '#2a5a9a',     // Blå
  good: '#2a7a5c',        // Grøn (score-bjælke)
  mid: '#c8882a',         // Gul/orange (mid score)
  bad: '#c83a2a',         // Rød (høj risiko)
  shadow: 'rgba(26,23,20,0.08)'
};

function getDimensions(format) {
  if (format === 'uge_tip') return { width: 1080, height: 1920 };
  return { width: 1080, height: 1080 };
}

// Vælg farve baseret på score (1-10, hvor 1=trygt, 10=højt fokus)
function scoreColor(score) {
  if (score === null || score === undefined) return COLORS.muted;
  const n = parseFloat(score);
  if (n <= 3) return COLORS.good;
  if (n <= 6) return COLORS.mid;
  return COLORS.bad;
}

// Score-label baseret på AI-score
function scoreLabel(score) {
  if (score === null || score === undefined) return 'Ikke vurderet';
  const n = parseFloat(score);
  if (n <= 3) return 'Trygt valg';
  if (n <= 6) return 'Se sammen';
  return 'Kræver opmærksomhed';
}

// Escape HTML/XML special characters for SVG text
function escapeXml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Wrap tekst over flere linjer baseret på maks tegn per linje
function wrapText(text, maxChars) {
  if (!text) return [];
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Forkort lang titel til at passe på én linje
function shortenTitle(title, maxChars) {
  if (!title || title.length <= maxChars) return title;
  return title.slice(0, maxChars - 1).trim() + '…';
}

// ──────────────────────────────────────────────
// TAG-MAPPING: emoji + farve per kategori
// ──────────────────────────────────────────────
const TAG_STYLES = {
  // Følelser & relationer
  'empati': { emoji: '🤝', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },
  'venskab': { emoji: '🫶', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },
  'familieliv': { emoji: '👨‍👩‍👧', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },
  'tryghed': { emoji: '🌙', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },
  'kærlighed': { emoji: '💛', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },

  // Læring & viden
  'læring': { emoji: '🧠', bg: '#dcefe5', stroke: '#2a7a5c', text: '#1a5a40' },
  'natur': { emoji: '🌱', bg: '#dcefe5', stroke: '#2a7a5c', text: '#1a5a40' },
  'sprog': { emoji: '📚', bg: '#dcefe5', stroke: '#2a7a5c', text: '#1a5a40' },
  'matematik': { emoji: '🔢', bg: '#dcefe5', stroke: '#2a7a5c', text: '#1a5a40' },
  'historie': { emoji: '📜', bg: '#dcefe5', stroke: '#2a7a5c', text: '#1a5a40' },
  'videnskab': { emoji: '🔬', bg: '#dcefe5', stroke: '#2a7a5c', text: '#1a5a40' },

  // Kreativitet & udtryk
  'kreativitet': { emoji: '🎨', bg: '#dde6f5', stroke: '#2a5a9a', text: '#1a4080' },
  'musik': { emoji: '🎵', bg: '#dde6f5', stroke: '#2a5a9a', text: '#1a4080' },
  'fantasi': { emoji: '✨', bg: '#dde6f5', stroke: '#2a5a9a', text: '#1a4080' },
  'kunst': { emoji: '🖌️', bg: '#dde6f5', stroke: '#2a5a9a', text: '#1a4080' },
  'fortælling': { emoji: '📖', bg: '#dde6f5', stroke: '#2a5a9a', text: '#1a4080' },

  // Aktivitet & bevægelse
  'aktivt': { emoji: '🏃', bg: '#fef0d5', stroke: '#c8882a', text: '#8a5a1a' },
  'bevægelse': { emoji: '⚽', bg: '#fef0d5', stroke: '#c8882a', text: '#8a5a1a' },
  'sport': { emoji: '🏆', bg: '#fef0d5', stroke: '#c8882a', text: '#8a5a1a' },

  // Humor & glæde
  'humor': { emoji: '😄', bg: '#fef0d5', stroke: '#c8882a', text: '#8a5a1a' },
  'sjov': { emoji: '🎉', bg: '#fef0d5', stroke: '#c8882a', text: '#8a5a1a' },

  // Dansk
  'dansk': { emoji: '🇩🇰', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },
  'dansksproget': { emoji: '🇩🇰', bg: '#fde8df', stroke: '#c85a2a', text: '#8a3d1a' },

  // Default fallback
  '_default': { emoji: '✨', bg: '#f0ead8', stroke: '#9a9186', text: '#3d3830' }
};

function getTagStyle(tagName) {
  if (!tagName) return TAG_STYLES._default;
  const normalized = String(tagName).toLowerCase().trim();
  return TAG_STYLES[normalized] || TAG_STYLES._default;
}

// Estimer bredde af tag-chip baseret på tekst
function tagChipWidth(tag) {
  const len = String(tag).length;
  return 100 + len * 18; // padding + cirka karakter-bredde
}

// ──────────────────────────────────────────────
// CARD 1: VURDERING (1080x1080)
// ──────────────────────────────────────────────
function generateVurderingCard(data) {
  const W = 1080, H = 1080;
  const PAD = 70;
  const aiColor = scoreColor(data.aiScore);
  const aiLabel = scoreLabel(data.aiScore);

  // Tilpas titel-størrelse baseret på længde
  const titleText = escapeXml(data.title);
  const titleFontSize = data.title.length > 25 ? 70 : data.title.length > 15 ? 88 : 100;
  const titleDisplay = shortenTitle(data.title, 40);

  // Værdier-sektion: smart layout der pakker chips horisontalt og wrapper hvis nødvendigt
  let tagsSection = '';
  if (data.tags && data.tags.length > 0) {
    // Tag-label
    tagsSection += `
      <text x="${PAD}" y="830" font-family="sans-serif" font-size="22" font-weight="500" fill="${COLORS.muted}" letter-spacing="2">
        VÆRDIER I FÅR MED
      </text>
    `;

    // Layout chips horisontalt
    let currentX = PAD;
    const chipY = 870;
    const chipHeight = 56;
    const gap = 14;
    const maxWidth = W - 2 * PAD;

    for (const tag of data.tags.slice(0, 4)) {
      const style = getTagStyle(tag);
      const chipText = tag.charAt(0).toUpperCase() + tag.slice(1);
      const chipW = tagChipWidth(chipText);

      if (currentX + chipW > W - PAD) break; // skip hvis ikke plads

      tagsSection += `
        <rect x="${currentX}" y="${chipY}" width="${chipW}" height="${chipHeight}" rx="28" 
              fill="${style.bg}" stroke="${style.stroke}" stroke-width="2"/>
        <text x="${currentX + 28}" y="${chipY + 38}" font-family="sans-serif" 
              font-size="28" font-weight="500" fill="${style.text}">
          ${style.emoji} ${escapeXml(chipText)}
        </text>
      `;
      currentX += chipW + gap;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Baggrund -->
  <rect width="${W}" height="${H}" fill="${COLORS.cream}"/>
  
  <!-- Subtle topbar -->
  <rect x="0" y="0" width="${W}" height="8" fill="${COLORS.accent}"/>
  
  <!-- Skærmtjek logo -->
  <text x="${PAD}" y="${PAD + 30}" font-family="sans-serif" font-size="28" font-weight="700" fill="${COLORS.ink}">
    Skærm<tspan fill="${COLORS.accent}">Tjek</tspan>
  </text>
  
  <!-- Platform-label -->
  <text x="${W - PAD}" y="${PAD + 30}" text-anchor="end" font-family="sans-serif" font-size="22" font-weight="500" fill="${COLORS.muted}">
    ${escapeXml(data.platform.toUpperCase())}
  </text>
  
  <!-- Titel -->
  <text x="${PAD}" y="320" font-family="serif" font-size="${titleFontSize}" font-weight="700" fill="${COLORS.ink}" letter-spacing="-2">
    ${escapeXml(titleDisplay)}
  </text>
  
  <!-- Aldersbadge -->
  <rect x="${PAD}" y="370" width="290" height="64" rx="32" fill="${COLORS.ink}"/>
  <text x="${PAD + 145}" y="411" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="600" fill="${COLORS.cream}">
    ${data.age ? `Vejledende fra ${data.age} år` : 'Alder ikke sat'}
  </text>
  
  <!-- Score-sektion -->
  <line x1="${PAD}" y1="510" x2="${W - PAD}" y2="510" stroke="${COLORS.border}" stroke-width="2"/>
  
  <!-- AI Score -->
  <text x="${PAD}" y="580" font-family="sans-serif" font-size="22" font-weight="500" fill="${COLORS.muted}" letter-spacing="2">
    AI-VURDERING
  </text>
  <text x="${PAD}" y="700" font-family="serif" font-size="130" font-weight="700" fill="${aiColor}">
    ${data.aiScore !== null ? data.aiScore : '—'}
  </text>
  <text x="${PAD}" y="750" font-family="sans-serif" font-size="26" font-weight="500" fill="${aiColor}">
    ${aiLabel}
  </text>
  
  <!-- Forældre Score -->
  <text x="${W / 2 + 30}" y="580" font-family="sans-serif" font-size="22" font-weight="500" fill="${COLORS.muted}" letter-spacing="2">
    FORÆLDRE
  </text>
  <text x="${W / 2 + 30}" y="700" font-family="serif" font-size="130" font-weight="700" fill="${data.parentScore !== null ? scoreColor(data.parentScore) : COLORS.muted}">
    ${data.parentScore !== null ? data.parentScore : '—'}
  </text>
  <text x="${W / 2 + 30}" y="750" font-family="sans-serif" font-size="26" font-weight="500" fill="${COLORS.muted}">
    ${data.parentVotes > 0 ? `${data.parentVotes} stemmer` : 'Vær den første'}
  </text>
  
  <!-- Skala-note -->
  <text x="${PAD}" y="800" font-family="sans-serif" font-size="18" font-weight="400" fill="${COLORS.muted}" font-style="italic">
    Skala 1-10 · Lavere tal = lavere bekymring
  </text>
  
  <!-- Tags-sektion -->
  ${tagsSection}
  
  <!-- CTA i bunden -->
  <line x1="${PAD}" y1="${H - 110}" x2="${W - PAD}" y2="${H - 110}" stroke="${COLORS.border}" stroke-width="2"/>
  <text x="${PAD}" y="${H - 50}" font-family="sans-serif" font-size="28" font-weight="600" fill="${COLORS.ink}">
    Læs hele vurderingen
  </text>
  <text x="${W - PAD}" y="${H - 50}" text-anchor="end" font-family="sans-serif" font-size="28" font-weight="600" fill="${COLORS.accent}">
    skaermtjek.dk →
  </text>
</svg>`;
}

// ──────────────────────────────────────────────
// CARD 2: UGE-TIP (1080x1920) — Instagram Stories
// ──────────────────────────────────────────────
function generateUgeTipCard(data) {
  const W = 1080, H = 1920;
  const PAD = 90;
  const aiColor = scoreColor(data.aiScore);

  const titleDisplay = shortenTitle(data.title, 25);
  const titleFontSize = data.title.length > 18 ? 100 : 130;

  // Top 3 bullets
  const bullets = (data.bullets || []).slice(0, 3);
  const bulletsXml = bullets.map((b, i) => {
    const y = 1180 + (i * 130);
    return `
      <text x="${PAD}" y="${y}" font-family="sans-serif" font-size="36" font-weight="600" fill="${COLORS.ink}">
        ${escapeXml(b.icon || '•')} ${escapeXml(b.highlight || '')}
      </text>
      <text x="${PAD}" y="${y + 42}" font-family="sans-serif" font-size="30" font-weight="400" fill="${COLORS.ink2}">
        ${escapeXml((b.text || '').slice(0, 55))}
      </text>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Baggrund med gradient -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLORS.cream}"/>
      <stop offset="100%" stop-color="${COLORS.warm}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  
  <!-- Topbar -->
  <rect x="0" y="0" width="${W}" height="12" fill="${COLORS.accent}"/>
  
  <!-- Skærmtjek logo -->
  <text x="${PAD}" y="${PAD + 50}" font-family="sans-serif" font-size="40" font-weight="700" fill="${COLORS.ink}">
    Skærm<tspan fill="${COLORS.accent}">Tjek</tspan>
  </text>
  
  <!-- Ugens fund-badge -->
  <rect x="${PAD}" y="350" width="540" height="80" rx="40" fill="${COLORS.accent}"/>
  <text x="${PAD + 270}" y="403" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="600" fill="${COLORS.cream}">
    🌟 UGENS FAMILIEFUND
  </text>
  
  <!-- Platform -->
  <text x="${PAD}" y="520" font-family="sans-serif" font-size="32" font-weight="500" fill="${COLORS.muted}" letter-spacing="3">
    ${escapeXml(data.platform.toUpperCase())}
  </text>
  
  <!-- Titel -->
  <text x="${PAD}" y="700" font-family="serif" font-size="${titleFontSize}" font-weight="700" fill="${COLORS.ink}" letter-spacing="-3">
    ${escapeXml(titleDisplay)}
  </text>
  
  <!-- Score -->
  <text x="${PAD}" y="900" font-family="sans-serif" font-size="28" font-weight="500" fill="${COLORS.muted}" letter-spacing="2">
    AI-VURDERING
  </text>
  <text x="${PAD}" y="1030" font-family="serif" font-size="180" font-weight="700" fill="${aiColor}">
    ${data.aiScore !== null ? data.aiScore : '—'}
  </text>
  
  <!-- Alder -->
  <rect x="${W - PAD - 380}" y="940" width="380" height="90" rx="45" fill="${COLORS.ink}"/>
  <text x="${W - PAD - 190}" y="1000" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="600" fill="${COLORS.cream}">
    ${data.age ? `Fra ${data.age} år` : 'Vejledende'}
  </text>
  
  <!-- Bullets -->
  <line x1="${PAD}" y1="1110" x2="${W - PAD}" y2="1110" stroke="${COLORS.border}" stroke-width="2"/>
  ${bulletsXml}
  
  <!-- CTA -->
  <line x1="${PAD}" y1="${H - 200}" x2="${W - PAD}" y2="${H - 200}" stroke="${COLORS.border}" stroke-width="2"/>
  <text x="${W / 2}" y="${H - 120}" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="600" fill="${COLORS.ink}">
    Se hele vurderingen
  </text>
  <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-family="sans-serif" font-size="44" font-weight="700" fill="${COLORS.accent}">
    skaermtjek.dk →
  </text>
</svg>`;
}

// ──────────────────────────────────────────────
// CARD 3: HEADS-UP (1080x1080)
// ──────────────────────────────────────────────
function generateHeadsUpCard(data) {
  const W = 1080, H = 1080;
  const PAD = 70;
  const aiColor = scoreColor(data.aiScore);

  // Smart valg af positiv og bekymring fra bullets
  // Positive ikoner (typisk associeret med positive ting): ✨💡🎨🧠📚🤝👥
  // Bekymrings-ikoner: ⚔️🗣️🎰🔔💰🔞😨
  const POSITIVE_ICONS = ['✨', '💡', '🎨', '🧠', '📚', '🤝', '👨‍👩‍👧', '⏱️', '🌱'];
  const CONCERN_ICONS = ['⚔️', '🗣️', '🎰', '🔔', '💰', '🔞', '😨', '👥', '🌐'];

  const allBullets = data.bullets || [];
  let positive = allBullets.find(b => POSITIVE_ICONS.includes(b.icon));
  let bekymring = allBullets.find(b => CONCERN_ICONS.includes(b.icon));

  // Fallback: hvis ikke fundet via ikoner, brug fra ai_scores eller første/sidste bullet
  if (!positive && allBullets.length > 0) {
    // Tag den første der ikke er bekymring
    positive = allBullets.find(b => !CONCERN_ICONS.includes(b.icon)) || allBullets[0];
  }
  if (!bekymring && allBullets.length > 1) {
    // Tag den sidste der ikke er positiv (typisk de værste bullets er sidst i lange lister)
    const reversed = [...allBullets].reverse();
    bekymring = reversed.find(b => !POSITIVE_ICONS.includes(b.icon) && b !== positive) || allBullets[allBullets.length - 1];
  }

  // Hvis vi har høj AI-score (>6) men kun "positive" bullets, brug score-data direkte
  const aiScoreNum = data.aiScore ? parseFloat(data.aiScore) : null;
  const isHighRisk = aiScoreNum !== null && aiScoreNum > 6;

  const titleDisplay = shortenTitle(data.title, 22);
  const titleFontSize = data.title.length > 18 ? 80 : 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Baggrund -->
  <rect width="${W}" height="${H}" fill="${COLORS.cream}"/>
  
  <!-- Topbar -->
  <rect x="0" y="0" width="${W}" height="8" fill="${COLORS.mid}"/>
  
  <!-- Skærmtjek logo -->
  <text x="${PAD}" y="${PAD + 30}" font-family="sans-serif" font-size="28" font-weight="700" fill="${COLORS.ink}">
    Skærm<tspan fill="${COLORS.accent}">Tjek</tspan>
  </text>
  
  <!-- Platform -->
  <text x="${W - PAD}" y="${PAD + 30}" text-anchor="end" font-family="sans-serif" font-size="22" font-weight="500" fill="${COLORS.muted}">
    ${escapeXml(data.platform.toUpperCase())}
  </text>
  
  <!-- Heads-up badge -->
  <rect x="${PAD}" y="180" width="430" height="76" rx="38" fill="${COLORS.mid}"/>
  <text x="${PAD + 215}" y="231" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="600" fill="${COLORS.cream}">
    👀 FORÆLDRE-TJEK
  </text>
  
  <!-- Titel -->
  <text x="${PAD}" y="360" font-family="serif" font-size="${titleFontSize}" font-weight="700" fill="${COLORS.ink}" letter-spacing="-2">
    ${escapeXml(titleDisplay)}
  </text>
  
  <!-- Alder -->
  <rect x="${PAD}" y="420" width="280" height="58" rx="29" fill="${COLORS.ink}"/>
  <text x="${PAD + 140}" y="459" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="600" fill="${COLORS.cream}">
    ${data.age ? `Vejledende fra ${data.age} år` : 'Vejledende'}
  </text>
  
  <!-- Positiv -->
  ${positive ? `
  <rect x="${PAD}" y="540" width="${W - 2 * PAD}" height="160" rx="12" fill="${COLORS.warm}" stroke="${COLORS.good}" stroke-width="3"/>
  <text x="${PAD + 30}" y="595" font-family="sans-serif" font-size="30" font-weight="700" fill="${COLORS.good}">
    ✅ ${escapeXml(positive.highlight || 'Positiv')}
  </text>
  <text x="${PAD + 30}" y="650" font-family="sans-serif" font-size="26" font-weight="400" fill="${COLORS.ink2}">
    ${escapeXml((positive.text || '').slice(0, 60))}
  </text>
  ` : `
  <rect x="${PAD}" y="540" width="${W - 2 * PAD}" height="160" rx="12" fill="${COLORS.warm}" stroke="${COLORS.muted}" stroke-width="3"/>
  <text x="${PAD + 30}" y="595" font-family="sans-serif" font-size="30" font-weight="700" fill="${COLORS.muted}">
    Ingen klare styrker fremhævet
  </text>
  `}
  
  <!-- Bekymring -->
  ${bekymring ? `
  <rect x="${PAD}" y="730" width="${W - 2 * PAD}" height="160" rx="12" fill="${COLORS.warm}" stroke="${COLORS.bad}" stroke-width="3"/>
  <text x="${PAD + 30}" y="785" font-family="sans-serif" font-size="30" font-weight="700" fill="${COLORS.bad}">
    ⚠️ ${escapeXml(bekymring.highlight || 'Opmærksomhed')}
  </text>
  <text x="${PAD + 30}" y="840" font-family="sans-serif" font-size="26" font-weight="400" fill="${COLORS.ink2}">
    ${escapeXml((bekymring.text || '').slice(0, 60))}
  </text>
  ` : (isHighRisk ? `
  <rect x="${PAD}" y="730" width="${W - 2 * PAD}" height="160" rx="12" fill="${COLORS.warm}" stroke="${COLORS.bad}" stroke-width="3"/>
  <text x="${PAD + 30}" y="785" font-family="sans-serif" font-size="30" font-weight="700" fill="${COLORS.bad}">
    ⚠️ Høj AI-score
  </text>
  <text x="${PAD + 30}" y="840" font-family="sans-serif" font-size="26" font-weight="400" fill="${COLORS.ink2}">
    Score ${data.aiScore} indikerer flere bekymringspunkter
  </text>
  ` : '')}
  
  <!-- CTA -->
  <line x1="${PAD}" y1="${H - 110}" x2="${W - PAD}" y2="${H - 110}" stroke="${COLORS.border}" stroke-width="2"/>
  <text x="${PAD}" y="${H - 50}" font-family="sans-serif" font-size="28" font-weight="600" fill="${COLORS.ink}">
    Vurderingen findes på
  </text>
  <text x="${W - PAD}" y="${H - 50}" text-anchor="end" font-family="sans-serif" font-size="28" font-weight="600" fill="${COLORS.accent}">
    skaermtjek.dk →
  </text>
</svg>`;
}
