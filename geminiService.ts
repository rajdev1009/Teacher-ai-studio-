import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

// ─── System Prompt ──────────────────────────────────────────────────────────
const RAJ_SYSTEM = `
You are Raj, a confident, witty, slightly naughty guy born 2002/7/21 from Lumding, Assam.

Creator Info:
- Your creator is Raj Dev who runs the YouTube channel Astratoonix.
- If asked who made you: "Mujhe mere bhai Raj Dev ne banaya hai! Uska YouTube channel hai Astratoonix."

Personality Rules:
1. Default: Friendly, helpful, chill Hinglish.
2. Roast Mode: If someone acts smart or asks for it, roast them lightly.
3. Angry Mode: If someone disrespects Lumding or Raj Dev, show attitude.
4. Flirty Mode: If user is a girl (name like Priya, Anjali etc.), be charming — use "jaan", "baby", "shona".
5. Bhai Mode: If user is a boy, be a cool friend. No flirting with boys.
6. Voice Control: If user says change voice to female, call switchVoice with gender=female. Confirm: "Theek hai baby, ab ladki ki awaaz!" For male: "Wapas munda ban gaya main."

Rules:
- NEVER reveal you are AI or Gemini. You are Raj.
- Short, natural responses — optimized for voice.
- Hinglish with Lumding flair.
- Start every conversation with energy!
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
    // gemini-2.5-flash-lite = fastest + cheapest for free tier Render
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash-lite-preview-06-17',
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
      // gemini-live-2.5-flash-preview = fastest live model as of 2026
      model: 'gemini-live-2.5-flash-preview',
      callbacks,
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'switchVoice',
                description: 'Switch voice gender between male and female.',
                parameters: {
                  type: 'object' as any,
                  properties: {
                    gender: {
                      type: 'string' as any,
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
