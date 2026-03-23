// WordStick API — /api/tree
// Loads wordhub_tree.json (static), merges user's saved words into matching categories

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = neon(process.env.DATABASE_URL);

// Maps database category keys → wordhub_tree.json top-level keys
const CAT_KEY_MAP = {
  general:    '0.通用词',
  academic:   '1.校园',
  workplace:  '2.工作',
  technology: '3.技术',
  stem:       '4.数理化',
  geography:  '5.地理',
  life:       '7.社会',
  arts:       '8.艺术',
  politics:   '10.政治',
  economics:  '11.经济',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const userId = req.headers['x-user-id'];

  try {
    // Load static wordhub_tree.json from public/
    const filePath = join(process.cwd(), 'public', 'wordhub_tree.json');
    const tree = JSON.parse(readFileSync(filePath, 'utf8'));

    // If user identified, inject their saved words
    if (userId) {
      const userRows = await sql`
        SELECT word, phonetic, primary_zh, image_url, category
        FROM user_words
        WHERE user_id = ${userId}
        ORDER BY saved_at DESC
      `;

      if (userRows.length > 0) {
        // Build set of all existing words to avoid duplicates
        const existingWords = new Set();
        function collectWords(node) {
          if (Array.isArray(node)) {
            node.forEach(w => existingWords.add((w.w || '').toLowerCase()));
          } else if (typeof node === 'object' && node !== null) {
            Object.values(node).forEach(collectWords);
          }
        }
        collectWords(tree);

        for (const r of userRows) {
          const lw = (r.word || '').toLowerCase();
          if (existingWords.has(lw)) continue; // skip if already in WordHub

          // Find matching top-level key, fallback to 0.通用词
          const topKey = CAT_KEY_MAP[r.category] || '0.通用词';
          if (!tree[topKey]) continue;

          // Inject into "📌 我保存的" sub-category
          const subKey = '📌 我保存的';
          if (!tree[topKey][subKey]) tree[topKey][subKey] = [];
          tree[topKey][subKey].push({
            w: r.word,
            i: r.phonetic || '',
            img: r.image_url || '',
            zh: r.primary_zh || '',
            source: 'wordstick'
          });
        }
      }

      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 's-maxage=3600');
    }

    return res.json(tree);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
