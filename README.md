# Raj – 16 file Astratoonix Chat

Real-time Hinglish AI voice chatbot powered by Gemini Live API.

## Render Deployment

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service → Connect GitHub repo
3. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Port:** `3000`
4. Environment Variables:
   - `GEMINI_API_KEY` = your Gemini API key
5. Deploy!

## File Structure (Flat — no subfolders)
```
├── App.tsx          # Main React UI
├── geminiService.ts # Gemini API (Live + Chat)
├── audio-utils.ts   # Mic input & audio output
├── utils.ts         # cn() helper
├── main.tsx         # React entry
├── index.html       # HTML root
├── index.css        # Tailwind CSS
├── server.ts        # Express server
├── vite.config.ts   # Vite config
├── tsconfig.json    # TypeScript config
├── package.json     # Dependencies
├── Dockerfile       # Docker build
└── metadata.json    # App metadata
```

## Models Used
- **Live voice:** `gemini-live-2.5-flash-preview` (fastest live model 2026)
- **Text chat:** `gemini-2.5-flash-lite-preview-06-17` (fastest + cheapest)

## Image Customization
In `App.tsx`, replace these constants with your own image URLs:
```ts
const BG_IMAGE_URL = '...';   // Background image
const CENTER_IMAGE_URL = '...'; // Center avatar image
```
