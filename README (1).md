# SkærmTjek Vidensagent

En agent der automatisk genererer forskningsbaserede artikler om børn og digitale medier og poster dem til Supabase.

---

## Kom i gang (10 minutter)

### Trin 1 — Opret articles-tabel i Supabase

Gå til **supabase.com → SQL Editor → New query** og kør:

```sql
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
```

### Trin 2 — Hent Anthropic API-nøgle

1. Gå til **console.anthropic.com**
2. Opret en konto (gratis)
3. Gå til **API Keys → Create Key**
4. Kopiér nøglen (starter med `sk-ant-...`)

Prisestimering: Hver artikel koster ca. 1-3 kr. at generere med Claude Sonnet.

### Trin 3 — Kør agenten manuelt

```bash
# Installer Node.js fra nodejs.org hvis du ikke har det

# Sæt din API-nøgle
export ANTHROPIC_API_KEY="sk-ant-din-nøgle-her"

# Kør agenten
node generate_articles.js
```

Agenten genererer **2-3 artikler per kørsel** og springer emner over der allerede er publiceret.

---

## Automatisk ugentlig kørsel via GitHub Actions

Hvis du lægger projektet på GitHub kan du køre agenten automatisk hver uge gratis.

### Opret `.github/workflows/weekly-articles.yml`:

```yaml
name: Generer ugentlige artikler

on:
  schedule:
    - cron: '0 8 * * 1'  # Hver mandag kl. 8:00
  workflow_dispatch:       # Kan også køres manuelt

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Kør vidensagent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node agent/generate_articles.js
```

### Tilføj API-nøgle som GitHub Secret:
1. Gå til dit GitHub-repo → **Settings → Secrets → Actions**
2. Klik **New repository secret**
3. Navn: `ANTHROPIC_API_KEY`
4. Værdi: din Anthropic-nøgle

---

## Tilføj nye emner

Åbn `generate_articles.js` og tilføj et nyt emne i `TOPICS`-arrayet:

```javascript
{
  id: 'unikt-id',           // Bruges til at undgå dubletter
  title: 'Artiklens titel',
  focus: 'Hvad skal agenten undersøge og skrive om?',
  category: 'Forskning',    // eller 'Praktiske råd', 'Spil & Sikkerhed' etc.
  emoji: '🔬',
  tags: ['tag1', 'tag2'],
  related_tags: ['vanedannende', 'skærmtid'],  // Matcher vurderingernes scores
},
```

---

## Omkostninger

| Handling | Estimeret pris |
|---|---|
| 1 artikel (med web search) | ~1-3 kr. |
| Fuld batch (8 artikler) | ~10-25 kr. |
| Månedlig kørsel (8-10 artikler) | ~20-50 kr. |

Priser er estimater baseret på Claude Sonnet + web search tokens.

---

## Arkitektur

```
generate_articles.js
  │
  ├── callClaude()         ← Kalder Claude API med web search
  ├── generateArticle()    ← Bygger prompt, parser JSON-svar
  ├── articleExists()      ← Tjekker om emnet allerede er publiceret  
  └── supabaseRequest()    ← Poster til Supabase articles-tabel
```

Siden (`index.html`) henter automatisk artikler fra Supabase ved siden loader og viser dem i **Viden**-fanen.
