# WordStick

A context-aware vocabulary learning system built as a Chrome extension. Users can highlight English words on any webpage, save them with Chinese definitions, and review them through a treemap-style web interface.

## Features

- **In-context word capture** — Highlight any word while browsing to save it instantly
- **Auto-classification** — Words are automatically categorized against an 11,298-word semantic hub
- **Treemap review interface** — Visual word review page organized by topic
- **Cloud sync** — User vocabulary synced to PostgreSQL database via REST API
- **Service Worker keepalive** — Persistent background sync without interruption

## Tech Stack

- **Extension**: JavaScript, Chrome Extension API (Manifest V3)
- **Backend**: Node.js, Vercel Serverless Functions
- **Database**: Neon (PostgreSQL)
- **Deployment**: Vercel

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/words?type=wordhub` | WordHub library (11,298 words) |
| GET | `/api/words?type=user` | User saved words (requires `X-User-ID`) |
| GET | `/api/words?type=all` | Combined wordhub + user words |
| POST | `/api/words` | Sync user words (requires `X-User-ID`) |
| DELETE | `/api/words?word=xxx` | Delete a word (requires `X-User-ID`) |
| GET | `/api/tree` | WordHub directory tree |

## Deployment

1. Clone this repo and push to GitHub
2. Import into [Vercel](https://vercel.com)
3. Add environment variable:
```
   DATABASE_URL = your Neon connection string
```
4. Deploy

## Live Demo

- Review page: [wordstick-api.vercel.app](https://wordstick-api.vercel.app)
- Chrome Extension: [Chrome Web Store](#) 

## License

MIT



<img width="1157" height="1438" alt="Screenshot 2026-04-01 at 1 14 36 PM" src="https://github.com/user-attachments/assets/f19b647d-bf68-47e3-8f67-ee0d41cf0b2e" />
