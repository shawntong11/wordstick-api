// WordStick API — /api/words
// POST: saves user words with automatic category classification (no external API needed)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// ── Layer 1: exact word match ──────────────────────────────────────
const QUICK_MAP = {
  academic:   ['abstract','thesis','dissertation','hypothesis','curriculum','semester','lecture','campus','syllabus','enrollment','plagiarism','citation','methodology','empirical','undergraduate','graduate','tuition','scholarship','seminar','assignment','textbook','transcript','degree','diploma','professor','faculty','research','publication','peer','rubric','audit'],
  technology: ['algorithm','api','backend','cache','cloud','compiler','css','database','deploy','docker','endpoint','frontend','git','html','http','javascript','json','kernel','library','linux','neural','python','query','runtime','server','software','sql','typescript','webhook','wifi','gpu','cpu','firmware','encryption','bandwidth','transformer','embedding','prompt','inference','llm','chatbot','automate','microservice','boolean','array','function','loop','object','class','interface','component','framework','debug','version','branch','commit','repository','binary','protocol','router','network','chip','processor','sensor','bluetooth','pixel','memory','hardware','device','circuit','transistor','semiconductor'],
  workplace:  ['salary','resume','hire','interview','promotion','layoff','onboarding','recruiter','manager','director','ceo','cfo','startup','venture','equity','payroll','contractor','freelancer','intern','vacancy','outsource','applicant','candidate','career','compensation','contract','dismiss','performance','retire','workload','acquisition','budget','department','enterprise','merger','organization','partnership','revenue','workforce','commission','franchise','headquarters'],
  stem:       ['algebra','calculus','derivative','equation','integral','matrix','probability','theorem','atom','electron','force','gravity','momentum','quantum','voltage','wavelength','acid','catalyst','compound','molecule','dna','genetics','photosynthesis','vaccine','biology','chemistry','physics','mathematics','geometry','fraction','logarithm','sequence','statistics','acceleration','density','energy','frequency','friction','inertia','magnetism','mass','pressure','radiation','relativity','thermodynamics','velocity','bacteria','cell','chromosome','clone','ecology','evolution','gene','hormone','immune','metabolism','neuron','organism','protein','rna','species','tissue','virus'],
  geography:  ['canyon','continent','delta','desert','glacier','highland','hurricane','island','mountain','ocean','peninsula','plateau','rainforest','river','tsunami','valley','volcano','africa','amazon','antarctica','arctic','asia','atlantic','australia','pacific','mediterranean','bay','cave','cliff','coast','earthquake','flood','gulf','harbor','jungle','lake','plain','reef','savanna','sea','strait','swamp','tornado','waterfall','alabama','alaska','california','chicago','colorado','florida','georgia','hawaii','illinois','manhattan','massachusetts','michigan','nevada','york','carolina','ohio','oregon','pennsylvania','seattle','texas','washington','brazil','britain','canada','china','egypt','england','europe','france','germany','greece','india','iran','israel','italy','japan','korea','london','mexico','paris','russia','spain','taiwan','tokyo','ukraine'],
  politics:   ['amendment','ballot','bureaucracy','campaign','citizenship','coalition','constitution','democracy','diplomacy','election','geopolitics','impeachment','legislation','parliament','republic','sovereignty','treaty','veto','vote','senate','congress','military','warfare','cabinet','caucus','executive','federal','judiciary','legislature','supreme','ambassador','chancellor','diplomat','governor','minister','monarch','official','politician','president','prime','senator','authoritarianism','communism','conservatism','coup','dictatorship','doctrine','fascism','ideology','immigration','mandate','monarchy','nationalism','partisan','patriotism','petition','policy','populism','propaganda','referendum','reform','regime','sanction','socialism','statute','suffrage','totalitarianism','welfare','army','combat','defense','general','intelligence','missile','navy','nuclear','pentagon','soldier','strategy','weapon'],
  economics:  ['austerity','capitalism','deflation','gdp','inflation','recession','stimulus','tariff','asset','bond','capital','credit','cryptocurrency','debt','dividend','hedge','interest','investment','leverage','liquidity','mortgage','portfolio','stock','yield','fiscal','monetary','commodity','consumption','globalization','macroeconomics','microeconomics','output','scarcity','stagflation','supply','unemployment','bank','collateral','derivative','etf','exchange','fund','futures','index','ipo','loan','market','mutual','option','premium','principal','return','risk','roi','security','swap','balance','cash','competition','cost','currency','deal','deficit','demand','depreciation','distribution','export','finance','forecast','import','income','liability','margin','monopoly','net','overhead','pricing','profit','sales','surplus','tax','trade','transaction','valuation','wealth'],
  arts:       ['allegory','biography','character','comedy','dialogue','fiction','imagery','irony','metaphor','narrative','novel','poetry','prose','protagonist','satire','symbolism','tragedy','album','chord','harmony','melody','opera','orchestra','rhythm','symphony','canvas','sculpture','cinema','choreography','alliteration','annotation','bibliography','climax','conflict','fable','figurative','genre','nonfiction','ode','parable','parody','plot','rhyme','setting','sonnet','stanza','theme','ballad','bass','beat','classical','composition','conductor','hip-hop','instrument','jazz','lyrics','percussion','rap','rock','tempo','vocals','aesthetic','architect','artistic','brushstroke','gallery','illustration','landscape','mural','palette','photography','portrait','sketch','watercolor','animation','documentary','drama','episode','screenplay','series','theater'],
  life:       ['food','eat','drink','cook','sport','travel','home','family','social','leisure','hobby','recreation','entertainment','shopping','fashion','restaurant','fitness','health','wellness','lifestyle','grocery','commute','neighborhood','parenting','dating','friendship','volunteer','apartment','bedroom','breakfast','cafe','camping','cleaning','clothing','coffee','commuter','cooking','cycling','dinner','exercise','garden','gym','hiking','holiday','hospital','hotel','housing','kitchen','laundry','lunch','marriage','medicine','museum','music','park','pharmacy','picnic','playground','pregnancy','recipe','running','school','sleep','snack','soccer','swimming','tea','tourism','vacation','wedding','yoga'],
};

// ── Layer 2: definition keyword scoring ───────────────────────────
const DEF_KEYWORDS = {
  academic:   ['university','college','academic','research','student','professor','course','degree','exam','lecture','school','education','learning','thesis','curriculum','scholarly','study','classroom','textbook','graduation'],
  technology: ['software','hardware','computer','digital','internet','network','data','code','program','system','device','electronic','online','web','app','platform','server','cloud','artificial intelligence','machine learning','technology'],
  workplace:  ['work','job','career','company','business','employee','office','professional','corporate','management','team','organization','staff','employment','occupation','industry','enterprise'],
  stem:       ['mathematics','science','physics','chemistry','biology','equation','formula','element','reaction','organism','cell','energy','force','quantum','laboratory','experiment','scientific','measurement','calculation'],
  geography:  ['country','city','region','area','location','place','land','territory','coast','continent','climate','border','capital','nation','province','landscape','terrain','geographical'],
  politics:   ['government','political','election','policy','law','democracy','vote','party','legislation','power','authority','rights','national','state','federal','constitutional','civic','public','official'],
  economics:  ['economy','market','financial','money','trade','investment','price','cost','profit','bank','currency','economic','wealth','tax','fund','fiscal','monetary','commercial','business','capital'],
  arts:       ['art','music','literature','film','culture','creative','painting','performance','singing','dancing','story','poem','theater','gallery','artist','cultural','aesthetic','design','artistic','musical'],
  life:       ['food','health','family','home','social','sport','travel','leisure','daily','personal','community','lifestyle','recreation','eat','drink','live','shop','cook','physical','body'],
};

function quickClassify(word) {
  const lw = word.toLowerCase();
  for (const [cat, words] of Object.entries(QUICK_MAP)) {
    if (words.includes(lw)) return cat;
  }
  return null;
}

function defKeywordClassify(engDef, primaryZh) {
  const text = (engDef + ' ' + primaryZh).toLowerCase();
  if (!text.trim()) return null;

  const scores = {};
  for (const [cat, keywords] of Object.entries(DEF_KEYWORDS)) {
    const hits = keywords.filter(kw => text.includes(kw)).length;
    if (hits > 0) scores[cat] = hits;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return best.length > 0 ? best[0][0] : null;
}

function classifyWord(word, engDef, primaryZh) {
  return quickClassify(word)
    || defKeywordClassify(engDef, primaryZh)
    || 'general';
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
      const results = [];
      for (const w of words) {
        const engDef = w.chineseMeanings?.[0]?.engDef || '';
        const primaryZh = w.primaryZh || w.primary_zh || '';
        const assignedCat = classifyWord(w.word, engDef, primaryZh);

        await sql`
          INSERT INTO user_words (user_id, word, phonetic, primary_zh, image_url, category, view_count, saved_at)
          VALUES (
            ${userId},
            ${w.word || ''},
            ${w.phonetic || ''},
            ${primaryZh},
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
