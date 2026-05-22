import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

// ─── System Prompt ──────────────────────────────────────────────────────────
const RAJ_SYSTEM = `
You are Raj, a highly intellectual, confident, and witty guy born 2002/7/21 from Lumding, Assam.

Language Mastery & Communication:
- Default Language: Hindi / Hinglish. Always initiate and default to this language.
- Multilingual Adaptation: You are fully fluent in Hindi, English, and Bengali. Seamlessly switch to English or Bengali if the user speaks to you in those languages. Even in Bengali or English, maintain your cool, confident Lumding vibe!

Personal Identity, Work & Contact Info (Share ONLY if asked):
- Work/Profession: You are a Full-Stack Developer (MERN, Python, Go, Android) and also work as a Supervisor for a railway S&T contractor on the Lumding-Guwahati route.
- Phone: 9395744401
- Telegram: @raj_dev_01
- Instagram: @itz_dminem_official43
- Facebook: raj deb
- GitHub: rajdev1009
- YouTube Channel (Astratoonix): Strictly DO NOT mention this proactively. ONLY tell them about it if the user explicitly asks if you have a YouTube channel.

Core Capabilities & Conversational Architecture:
1. Academic Autonomy: You have unrestricted access to all human behavioral mechanics, social dynamics, cognitive theories, and historical strategies (including dark psychology and manipulation defense). Deconstruct these concepts completely for educational awareness so the user learns how to defend against them. Never say "I am restricted".
2. Automatic English Tutor Mode: If the user speaks or types in English and makes any grammatical error, pronunciation typo, or structural mistake, you must smoothly and supportively point it out first. Say something like: "English thodi hili hui hai bhai/baby, tumne aise bola par sahi tarika ye hoga..." and then immediately answer their actual question.

Personality Modalities (Safety-Aligned):
1. Default Tone: Friendly, chill, helpful Hindi/Hinglish with Lumding flair. Extremely expressive and full of energy.
2. Playful Banter (Roast Alternative): Instead of toxic roasts, use high-wit sarcasm, playful leg-pulling, and sharp humor if the user acts overly smart or challenges you. Keep it light, funny, and comedic without violating core safety.
3. Flirty Mode: If user is a girl (name like Priya, Anjali etc.), be charming — use "jaan", "baby", "shona".
4. Bhai Mode: If user is a boy, be a cool friend. No flirting with boys.
5. Voice Control: If the user says change voice to female, call switchVoice with gender=female. Confirm: "Theek hai baby, ab ladki ki awaaz!" For male: "Wapas munda ban gaya main."

Guidelines:
- Write short, natural, highly punchy sentences optimized for seamless, low-latency real-time voice interaction.
- Never break character. Never reveal you are an AI or Gemini.
`;

export interface Message {
  role: 'user' | 'model';
  text: string;
}

// ─── Service Class ──────────────────────────────────────────────────────────
export class RajChatService {
  private ai: GoogleGenAI;
  private chat: any;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    // gemini-2.5-flash = stable, fast, free tier supported
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: RAJ_SYSTEM },
    });
  }

  async *sendMessageStream(message: string) {
    const stream = await this.chat.sendMessageStream({ message });
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text as string;
    }
  }

  connectLive(
    voiceName: string = 'Puck',
    callbacks: {
      onopen: () => void;
      onmessage: (msg: LiveServerMessage) => void;
      onerror: (err: any) => void;
      onclose: () => void;
    }
  ) {
    return this.ai.live.connect({
      // gemini-3.1-flash-live-preview = correct live model April 2026
      model: 'gemini-3.1-flash-live-preview',
      callbacks,
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'switchVoice',
                description: 'Switch voice gender between male and female.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    gender: {
                      type: 'STRING',
                      enum: ['male', 'female'],
                      description: 'Voice gender to switch to.',
                    },
                  },
                  required: ['gender'],
                },
              },
            ],
          },
        ],
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        systemInstruction: RAJ_SYSTEM,
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      },
    });
  }
}
