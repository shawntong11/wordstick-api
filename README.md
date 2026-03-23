# WordStick API

Deploy to Vercel:

1. Push this folder to GitHub
2. Import into Vercel (vercel.com)
3. Add environment variable:
   DATABASE_URL = your Neon connection string
4. Deploy

API Endpoints:
- GET  /api/words?type=wordhub          → WordHub library
- GET  /api/words?type=user             → User saved words (needs X-User-ID header)
- GET  /api/words?type=all              → Both combined
- POST /api/words                       → Sync user words (needs X-User-ID header)
- DELETE /api/words?word=xxx            → Delete a word (needs X-User-ID header)
- GET  /api/tree                        → WordHub directory tree
