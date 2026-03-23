// WordStick API — /api/words
// Handles: GET (fetch words) and POST (save/sync words with AI classification)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// ── WordHub top-level categories (must match wordhub_tree exactly) ──
const WORDHUB_CATS = {
  academic:   '校园学术',
  technology: '科技',
  workplace:  '职场',
  stem:       '数理化',
  geography:  '地理',
  politics:   '政治',
  economics:  '经济金融',
  arts:       '艺术文化',
  life:       '社会生活',
  general:    '通用词'
};

// ── Fast local pre-classifier (avoids API call for obvious cases) ──
const QUICK_MAP = {
  academic:   ['abstract','thesis','dissertation','hypothesis','curriculum','semester','lecture','campus','syllabus','enrollment','plagiarism','citation','methodology','empirical','undergraduate','graduate','tuition','scholarship','seminar','assignment'],
  technology: ['algorithm','api','backend','cache','cloud','compiler','css','database','deploy','docker','endpoint','frontend','git','html','http','javascript','json','kernel','library','linux','neural','python','query','runtime','server','software','sql','typescript','webhook','wifi','gpu','cpu','firmware','encryption','bandwidth','transformer','embedding','prompt','inference','fine-tuning','llm','chatbot','automate','microservice'],
  workplace:  ['salary','resume','hire','interview','promotion','layoff','onboarding','recruiter','manager','director','ceo','cfo','startup','venture','equity','payroll','contractor','freelancer','intern','vacancy','outsource'],
  stem:       ['algebra','calculus','derivative','equation','integral','matrix','probability','theorem','atom','electron','force','gravity','momentum','quantum','voltage','wavelength','acid','catalyst','compound','molecule','dna','genetics','photosynthesis','vaccine','biology','chemistry','physics','mathematics'],
  geography:  ['canyon','continent','delta','desert','glacier','highland','hurricane','island','mountain','ocean','peninsula','plateau','rainforest','river','tsunami','valley','volcano','africa','amazon','antarctica','arctic','asia','atlantic','australia','pacific','mediterranean'],
  politics:   ['amendment','ballot','bureaucracy','campaign','citizenship','coalition','constitution','democracy','diplomacy','election','geopolitics','impeachment','legislation','parliament','republic','sovereignty','treaty','veto','vote','senate','congress','military','warfare'],
  economics:  ['austerity','capitalism','deflation','gdp','inflation','recession','stimulus','tariff','asset','bond','capital','credit','cryptocurrency','debt','dividend','equity','hedge','interest','investment','leverage','liquidity','mortgage','portfolio','stock','yield','fiscal','monetary'],
  arts:       ['allegory','biography','character','comedy','dialogue','fiction','imagery','irony','metaphor','narrative','novel','poetry','prose','protagonist','satire','symbolism','tragedy','album','chord','harmony','melody','opera','orchestra','rhythm','symphony','canvas','sculpture','cinema','choreography'],
  life:       ['food','eat','drink','cook','sport','travel','home','family','social','leisure','hobby','recreation','entertainment','shopping','fashion','restaurant','fitness','health','wellness','lifestyle','grocery','commute','neighborhood','parenting','dating','friendship','volunteer'],
};

function quickClassify(word) {
  const lw = word.toLowerCase();
  for (const [cat, words] of Object.entries(QUICK_MAP)) {
    if (words.includes(lw)) return cat;
  }
  return null;
}

// ── Claude API classification ──────────────────────────────────────
async function classifyWithClaude(words) {
  const catList = Object.entries(WORDHUB_CATS)
    .map(([k, v]) => `${k}(${v})`).join(', ');

  const prompt = `Classify each English word into exactly one category. Categories: ${catList}

Words to classify:
${words.map((w, i) => `${i+1}. "${w.word}"${w.primaryZh ? ` (中文: ${w.primaryZh})` : ''}${w.engDef ? ` (def: ${w.engDef})` : ''}`).join('\n')}

Reply ONLY with a JSON object. Keys are words (lowercase), values are category keys. Example: {"algorithm":"technology","president":"politics"}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!resp.ok) throw new Error(`Claude API error: ${resp.status}`);
  const data = await resp.json();
  const text = data.content?.[0]?.text || '{}';

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  const result = JSON.parse(match[0]);

  // Validate: only keep known categories
  const valid = {};
  for (const [word, cat] of Object.entries(result)) {
    valid[word.toLowerCase()] = WORDHUB_CATS[cat] ? cat : 'general';
  }
  return valid;
}

// ── Classify a batch (quick first, Claude for unknowns) ────────────
async function classifyWords(words) {
  const result = {};
  const needsClaude = [];

  for (const w of words) {
    const quick = quickClassify(w.word);
    if (quick) {
      result[w.word.toLowerCase()] = quick;
    } else {
      needsClaude.push(w);
    }
  }

  if (needsClaude.length > 0) {
    const BATCH = 20;
    for (let i = 0; i < needsClaude.length; i += BATCH) {
      const batch = needsClaude.slice(i, i + BATCH);
      try {
        const classified = await classifyWithClaude(batch);
        Object.assign(result, classified);
      } catch (e) {
        console.error('Claude classification failed:', e.message);
        for (const w of batch) result[w.word.toLowerCase()] = 'general';
      }
    }
  }

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.headers['x-user-id'];

  // ── GET /api/words ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { type, category, limit = 200, offset = 0 } = req.query;

    try {
      if (type === 'wordhub') {
        const catFilter = category ? sql`AND category = ${category}` : sql``;
        const rows = await sql`
          SELECT word, ipa, image_url, category, sub_category, source
          FROM wordhub_words
          ${catFilter}
          ORDER BY id
          LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
        return res.json({ words: rows, total: rows.length });
      }

      if (type === 'user' && userId) {
        const rows = await sql`
          SELECT word, phonetic, primary_zh, image_url, category, view_count, saved_at
          FROM user_words
          WHERE user_id = ${userId}
          ORDER BY saved_at DESC
        `;
        return res.json({ words: rows });
      }

      if (type === 'all' && userId) {
        const [userWords, hubWords] = await Promise.all([
          sql`SELECT word, phonetic as ipa, primary_zh, image_url, category, view_count, saved_at, 'wordstick' as source
              FROM user_words WHERE user_id = ${userId} ORDER BY saved_at DESC`,
          sql`SELECT word, ipa, '' as primary_zh, image_url, category, sub_category, 'wordhub' as source
              FROM wordhub_words ORDER BY id`
        ]);
        return res.json({ userWords, hubWords });
      }

      // Default: category summary
      const cats = await sql`
        SELECT category, COUNT(*) as count
        FROM wordhub_words
        GROUP BY category
        ORDER BY count DESC
      `;
      return res.json({ categories: cats });

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST /api/words ────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!userId) return res.status(400).json({ error: 'Missing X-User-ID header' });

    const { words } = req.body;
    if (!Array.isArray(words) || !words.length) {
      return res.status(400).json({ error: 'words array required' });
    }

    try {
      // Step 1: AI-classify all words
      const wordsForClassify = words.map(w => ({
        word: w.word,
        primaryZh: w.primaryZh || w.primary_zh || '',
        engDef: w.chineseMeanings?.[0]?.engDef || ''
      }));
      const categoryMap = await classifyWords(wordsForClassify);

      // Step 2: upsert with assigned categories
      const results = [];
      for (const w of words) {
        const assignedCat = categoryMap[w.word.toLowerCase()] || w.category || 'general';
        await sql`
          INSERT INTO user_words (user_id, word, phonetic, primary_zh, image_url, category, view_count, saved_at)
          VALUES (
            ${userId},
            ${w.word || ''},
            ${w.phonetic || ''},
            ${w.primaryZh || w.primary_zh || ''},
            ${w.imageUrl || w.image_url || ''},
            ${assignedCat},
            ${w.viewCount || w.view_count || 0},
            ${w.savedAt || w.saved_at || Date.now()}
          )
          ON CONFLICT (user_id, word)
          DO UPDATE SET
            phonetic = EXCLUDED.phonetic,
            primary_zh = EXCLUDED.primary_zh,
            image_url = EXCLUDED.image_url,
            category = EXCLUDED.category,
            view_count = EXCLUDED.view_count,
            saved_at = EXCLUDED.saved_at
        `;
        results.push({ word: w.word, category: assignedCat });
      }

      return res.json({ success: true, synced: words.length, classifications: results });

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE /api/words ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!userId) return res.status(400).json({ error: 'Missing X-User-ID header' });
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word param required' });

    try {
      await sql`DELETE FROM user_words WHERE user_id = ${userId} AND word = ${word}`;
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
