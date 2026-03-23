const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  const userId = req.headers['x-user-id'];

  if (req.method === 'GET') {
    const { type, category } = req.query;
    try {
      if (type === 'wordhub') {
        let rows;
        if (category) {
          rows = await sql`SELECT word, ipa, image_url, category, sub_category FROM wordhub_words WHERE category = ${category} ORDER BY id`;
        } else {
          rows = await sql`SELECT word, ipa, image_url, category, sub_category FROM wordhub_words ORDER BY id LIMIT 500`;
        }
        return res.json({ words: rows });
      }

      if (type === 'user' && userId) {
        const rows = await sql`SELECT word, phonetic, primary_zh, image_url, category, view_count, saved_at FROM user_words WHERE user_id = ${userId} ORDER BY saved_at DESC`;
        return res.json({ words: rows });
      }

      // Default: category summary
      const cats = await sql`SELECT category, COUNT(*) as count FROM wordhub_words GROUP BY category ORDER BY count DESC`;
      return res.json({ categories: cats });

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    if (!userId) return res.status(400).json({ error: 'Missing X-User-ID' });
    const { words } = req.body;
    if (!Array.isArray(words)) return res.status(400).json({ error: 'words array required' });

    try {
      for (const w of words) {
        await sql`
          INSERT INTO user_words (user_id, word, phonetic, primary_zh, image_url, category, view_count, saved_at)
          VALUES (${userId}, ${w.word||''}, ${w.phonetic||''}, ${w.primaryZh||''}, ${w.imageUrl||''}, ${w.category||'general'}, ${w.viewCount||0}, ${w.savedAt||Date.now()})
          ON CONFLICT (user_id, word) DO UPDATE SET
            phonetic = EXCLUDED.phonetic,
            primary_zh = EXCLUDED.primary_zh,
            image_url = EXCLUDED.image_url,
            category = EXCLUDED.category,
            view_count = EXCLUDED.view_count,
            saved_at = EXCLUDED.saved_at
        `;
      }
      return res.json({ success: true, synced: words.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    if (!userId) return res.status(400).json({ error: 'Missing X-User-ID' });
    const { word } = req.query;
    try {
      await sql`DELETE FROM user_words WHERE user_id = ${userId} AND word = ${word}`;
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
