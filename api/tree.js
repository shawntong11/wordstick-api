// WordStick API — /api/tree
// Returns WordHub tree merged with user's saved words
// User words are injected into their matching category node, marked with source:'wordstick'

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const userId = req.headers['x-user-id'];

  try {
    // Always fetch WordHub words
    const hubRows = await sql`
      SELECT word, ipa, image_url, category, sub_category
      FROM wordhub_words
      ORDER BY category, sub_category, id
    `;

    // Build tree: { category: { sub_category: [{w,i,img}] } }
    const tree = {};
    for (const r of hubRows) {
      const cat = r.category || 'general';
      const sub = r.sub_category || '通用';
      if (!tree[cat]) tree[cat] = {};
      if (!tree[cat][sub]) tree[cat][sub] = [];
      tree[cat][sub].push({
        w: r.word,
        i: r.ipa || '',
        img: r.image_url || ''
      });
    }

    // If user is identified, inject their saved words into the tree
    if (userId) {
      const userRows = await sql`
        SELECT word, phonetic, primary_zh, image_url, category
        FROM user_words
        WHERE user_id = ${userId}
        ORDER BY saved_at DESC
      `;

      for (const r of userRows) {
        const cat = r.category || 'general';
        const sub = '📌 我保存的';   // fixed sub-category for user words

        if (!tree[cat]) tree[cat] = {};
        if (!tree[cat][sub]) tree[cat][sub] = [];

        // Only add if not already in WordHub (avoid duplicates)
        const alreadyInHub = Object.values(tree[cat])
          .flat()
          .some(w => w.w?.toLowerCase() === r.word?.toLowerCase());

        if (!alreadyInHub) {
          tree[cat][sub].push({
            w: r.word,
            i: r.phonetic || '',
            img: r.image_url || '',
            zh: r.primary_zh || '',
            source: 'wordstick'   // mark as user-saved
          });
        }
      }
    }

    // No cache when user words are included (each user sees different data)
    if (userId) {
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
