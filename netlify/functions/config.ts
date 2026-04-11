import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
    }),
  };
};
