# Vireo AI Video Content Generator (VireoClip)

AI-powered platform that transforms one video into platform-specific content and short clips for YouTube, Instagram, Shorts, LinkedIn and more.

## Features

Based on the code, `docs/` and the test suite in this repository:

- Transcription with provider selection and failover (Groq or OpenRouter).
- Clip selection and clip-director logic, caption timing and ripple-cut editing.
- Smart reframing (face/shot aware) and FFmpeg rendering with output checks.
- Editor and content tools described in `docs/` (pro video editor, hook lab, thumbnail lab, brand brain, translation/dubbing, autopilot).
- Social account connections through OAuth (YouTube, Instagram/Meta, TikTok, LinkedIn, X).
- Usage metering with a monthly quota, and billing through Razorpay (India) or Paddle (other countries).

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, React Router, GSAP, Supabase JS.
- Backend (`server/`): Node.js 20.19+, Express, TypeScript, MongoDB, FFmpeg, plus Python helpers in `server/python`.
- Storage and services: Cloudflare R2, Supabase, Razorpay, Paddle.

## Getting started

```bash
npm install
npm install --prefix server
cp .env.example .env     # then fill in your own values
npm run dev              # frontend (Vite) and backend together
```

Other scripts from `package.json`: `npm run build`, `npm run build:all`, `npm test`, `npm run verify:all`. Server scripts (run with `--prefix server`): `dev`, `build`, `start`, `test`, `typecheck`. The server build runs `scripts/setup-python.js` first.

## Environment variables

Copy `.env.example` to `.env` and set your own values. Variable names only:

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`
- Server: `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- Database: `MONGODB_URI`, `MONGODB_DB_NAME`
- Cloudflare R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_SOURCE_BUCKET`, `R2_CLIPS_BUCKET`
- AI: `TRANSCRIPTION_PROVIDER`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, and optional model and timeout settings
- Social OAuth: client id, client secret and redirect URI for Google, Meta, TikTok, LinkedIn and X, plus `SOCIAL_TOKEN_ENCRYPTION_KEY`
- Billing: `RAZORPAY_*` and Paddle settings

Never commit real values. Keep server-side secrets such as `SUPABASE_SECRET_KEY` out of the frontend.

## Documentation

See the `docs/` folder (deployment, production checklist, editor, hook lab, autopilot and more) and `IMPLEMENTATION_STATUS.md`.

## License

This repository does not include a project license file, and the owner has not stated a license for it. Third-party material keeps its own license: for example `.agents/skills/ui-styling/` includes an Apache-2.0 `LICENSE.txt`, and npm dependencies keep their own licenses. Contact the repository owner about use of the project code.
