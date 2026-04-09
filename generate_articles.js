/**
 * SkærmTjek — Vidensagent
 * ========================
 * Genererer forskningsbaserede artikler om børn og digitale medier
 * og poster dem direkte til Supabase.
 *
 * SÅDAN KØRER DU DEN:
 * 1. Installer Node.js (nodejs.org) hvis du ikke har det
 * 2. Åbn Terminal / Kommandoprompt
 * 3. Naviger til denne mappe: cd sti/til/foraeldre-guide/agent
 * 4. Kør: node generate_articles.js
 *
 * ELLER automatisk ugentligt via GitHub Actions (se README.md)
 *
 * KONFIGURATION:
 * Udfyld dine nøgler nedenfor — de samme som i index.html
 */

// ── KONFIGURATION ─────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://numlafmwxgffshqcjxuc.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bWxhZm13eGdmZnNocWNqeHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjU0NTgsImV4cCI6MjA5MDgwMTQ1OH0.WojLfL2iz1ZDt6PeRqeGbC8BvJwwPdk4pzxZM390xbI';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || 'DIN_ANTHROPIC_API_NØGLE_HER';
// ─────────────────────────────────────────────────────────────────────────

/**
 * Emner agenten roterer igennem ugentligt.
 * Tilføj nye emner her for at udvide vidensbasen.
 */
const TOPICS = [
  {
    id: 'skaermtid-soevn',
    title: 'Skærmtid og søvn hos børn',
    focus: 'Hvordan påvirker skærmtid — særligt inden sengetid — børns søvnkvalitet og -mængde? Hvad siger dansk og international forskning? Konkrete anbefalinger til forældre.',
    category: 'Forskning',
    emoji: '😴',
    tags: ['skærmtid', 'søvn', 'sundhed'],
    related_tags: ['skærmtid', 'screentime'],
  },
  {
    id: 'gaming-drenge',
    title: 'Drenge og gaming: Fællesskab eller afhængighed?',
    focus: 'Gaming fylder enormt i drenges sociale liv. Hvornår er det sundt socialt samvær og hvornår er det afhængighed? Forskning fra Medierådet, KU og internationale studier.',
    category: 'Forskning',
    emoji: '🎮',
    tags: ['gaming', 'drenge', 'fællesskab', 'afhængighed'],
    related_tags: ['vanedannende', 'addiction', 'playstation'],
  },
  {
    id: 'foraeldre-dialog',
    title: 'Sådan taler du med dit barn om skærmbrug',
    focus: 'Praktiske kommunikationsstrategier baseret på forskning i børnepsykologi. Hvad virker — og hvad gør ondt værre? Konkrete samtalestartere til forskellige aldre.',
    category: 'Praktiske råd',
    emoji: '💬',
    tags: ['dialog', 'kommunikation', 'forældre', 'råd'],
    related_tags: ['skærmtid', 'screentime'],
  },
  {
    id: 'algoritmer-born',
    title: 'Algoritmer og børn: Hvem bestemmer hvad de ser?',
    focus: 'YouTube, TikTok og Netflix bruger algoritmer designet til at maksimere seertid. Hvad ved vi om hvordan disse algoritmer påvirker børns indholdsoplevelse? Hvad kan forældre gøre?',
    category: 'Digital forståelse',
    emoji: '🤖',
    tags: ['algoritmer', 'youtube', 'tiktok', 'Netflix'],
    related_tags: ['vanedannende', 'screentime', 'youtube', 'tiktok'],
  },
  {
    id: 'roblox-sikkerhed',
    title: 'Roblox og online-sikkerhed: Hvad forældre bør vide',
    focus: 'Roblox er verdens mest populære spilunivers for børn. Chatrisici, upassende brugerskabt indhold, mikrotransaktioner og forældrekontrol. Faktabaseret gennemgang.',
    category: 'Spil & Sikkerhed',
    emoji: '🔒',
    tags: ['roblox', 'sikkerhed', 'chat', 'køb i spil'],
    related_tags: ['roblox', 'playstation', 'commercialism'],
  },
  {
    id: 'skaermtid-skole',
    title: 'Skærm i skolen vs. skærm derhjemme: Ikke det samme',
    focus: 'Sundhedsstyrelsens anbefalinger gælder fritidsbrug. Hvad ved vi om forskellen på læringsrettet og passivt skærmbrug? Hvordan bør forældre tænke om det?',
    category: 'Digital forståelse',
    emoji: '🏫',
    tags: ['skole', 'læring', 'skærmtid', 'forskel'],
    related_tags: ['skærmtid', 'screentime'],
  },
  {
    id: 'tiktok-teenagere',
    title: 'TikTok og teenagere: Hvad siger den nyeste forskning?',
    focus: 'TikToks kortformatalgoritme er dokumenteret som ekstremt vanedannende. Ny forskning fra 2024-2025 om effekter på unge danskeres trivsel, selvbillede og søvn.',
    category: 'Forskning',
    emoji: '🎵',
    tags: ['tiktok', 'teenagere', 'forskning', 'mental sundhed'],
    related_tags: ['tiktok', 'sociale medier', 'vanedannende'],
  },
  {
    id: 'foraeldre-rollemodel',
    title: 'Forældrenes skærmbrug: Den vigtigste variabel',
    focus: 'Forskning viser konsistent at børns skærmvaner i høj grad afspejler forældrenes. Det danske JAMA-studie bekræfter: familiebaserede ændringer virker bedre end regler til barnet alene.',
    category: 'Forskning',
    emoji: '👨‍👩‍👧',
    tags: ['forældre', 'rollemodel', 'skærmtid', 'vaner'],
    related_tags: ['skærmtid', 'screentime'],
  },
];

// ── HJÆLPEFUNKTIONER ──────────────────────────────────────────────────────

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API fejl: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const textBlocks = data.content.filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('\n');
}

async function supabaseRequest(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase fejl (${method} ${path}): ${res.status} — ${err}`);
  }

  return res.json();
}

async function articleExists(topicId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?topic_id=eq.${topicId}&select=id`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const data = await res.json();
  return data && data.length > 0;
}

// ── ARTIKEL-GENERATOR ─────────────────────────────────────────────────────

async function generateArticle(topic) {
  console.log(`\n📝 Genererer: "${topic.title}"...`);

  const prompt = `Du er redaktør på SkærmTjek — en dansk forældreguide til digitalt indhold for børn.

Din opgave er at skrive en forskningsbaseret vidensartikel på dansk om følgende emne:

TITEL: ${topic.title}
FOKUS: ${topic.focus}
KATEGORI: ${topic.category}

KRAV:
- Søg efter aktuel dansk og international forskning (2022-2025) om emnet
- Brug konkrete tal og kildehenvisninger
- Skriv i et klart, tillidsfuldt forældrsprog — ikke akademisk
- Inkluder mindst ét faktaboks med konkrete data
- Afslut med praktiske råd
- Længde: 400-600 ord i brødtekst

VIGTIGT — returner KUN følgende JSON og intet andet:
{
  "summary": "2-3 sætningers teaser til kortet på forsiden (max 200 tegn)",
  "body": "Fuld HTML-artikel med <p>, <strong>, <em> tags og dette specielle format for faktabokse: <div class=\\"article-data-box\\"><div class=\\"adb-title\\">📊 Titel</div><div class=\\"adb-row\\"><span class=\\"adb-label\\">Label</span><span class=\\"adb-val\\">Værdi</span></div></div>",
  "sources": ["Kilde 1", "Kilde 2", "Kilde 3"]
}`;

  const raw = await callClaude(prompt);

  // Extract JSON from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Ingen JSON fundet i Claude-svar');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Try to clean and parse
    const cleaned = jsonMatch[0]
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    parsed = JSON.parse(cleaned);
  }

  return {
    topic_id: topic.id,
    title: topic.title,
    category: topic.category,
    emoji: topic.emoji,
    tags: topic.tags,
    related_tags: topic.related_tags,
    summary: parsed.summary,
    body: parsed.body,
    sources: parsed.sources,
    published_at: new Date().toISOString(),
    generated_by: 'SkærmTjek Agent v1.0',
  };
}

// ── SUPABASE TABEL-SETUP ──────────────────────────────────────────────────

async function ensureArticlesTable() {
  // Check if table exists by querying it
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/articles?limit=1`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    console.log('✓ articles-tabel eksisterer');
  } catch(e) {
    console.log('⚠️  Kør denne SQL i Supabase SQL Editor først:\n');
    console.log(`
create table articles (
  id bigint generated always as identity primary key,
  topic_id text unique not null,
  title text not null,
  category text,
  emoji text,
  tags text[],
  related_tags text[],
  summary text,
  body text,
  sources text[],
  published_at timestamptz default now(),
  generated_by text,
  created_at timestamptz default now()
);

alter table articles enable row level security;
create policy "Allow all reads" on articles for select using (true);
create policy "Allow all inserts" on articles for insert with check (true);
    `);
    process.exit(1);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 SkærmTjek Vidensagent starter...');
  console.log(`📅 ${new Date().toLocaleDateString('da-DK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);

  if (ANTHROPIC_KEY === 'DIN_ANTHROPIC_API_NØGLE_HER') {
    console.error('\n❌ Sæt din Anthropic API-nøgle:');
    console.error('   export ANTHROPIC_API_KEY="sk-ant-..."');
    console.error('   node generate_articles.js\n');
    process.exit(1);
  }

  await ensureArticlesTable();

  // Find topics not yet published
  const unpublished = [];
  for (const topic of TOPICS) {
    const exists = await articleExists(topic.id);
    if (!exists) unpublished.push(topic);
  }

  if (unpublished.length === 0) {
    console.log('\n✅ Alle artikler er allerede genereret!');
    console.log('   Tilføj nye emner i TOPICS-arrayet for at generere mere indhold.');
    return;
  }

  // Generate 2-3 articles per run (to control API costs)
  const toGenerate = unpublished.slice(0, 3);
  console.log(`\n📚 Genererer ${toGenerate.length} artikel(er)...`);

  let successCount = 0;

  for (const topic of toGenerate) {
    try {
      const article = await generateArticle(topic);

      // Save to Supabase
      await supabaseRequest('articles', 'POST', article);

      console.log(`✓ "${topic.title}" gemt i Supabase`);
      successCount++;

      // Small delay between requests
      await new Promise(r => setTimeout(r, 2000));

    } catch (e) {
      console.error(`✗ Fejl ved "${topic.title}": ${e.message}`);
    }
  }

  console.log(`\n🎉 Færdig! ${successCount}/${toGenerate.length} artikler genereret.`);
  console.log(`   ${unpublished.length - toGenerate.length} emner tilbage til næste kørsel.`);
}

main().catch(console.error);
