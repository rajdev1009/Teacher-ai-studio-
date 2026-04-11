import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Expose API key to frontend safely
  app.get('/api/config', (_req, res) => {
    res.json({ GEMINI_API_KEY: process.env.GEMINI_API_KEY || '' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Raj is alive!' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`✅ Raj running on http://0.0.0.0:${PORT}`));
}

start();
