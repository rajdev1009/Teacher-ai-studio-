import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { RajChatService, Message } from './geminiService';
import { AudioRecorder, AudioStreamer } from './audio-utils';
import { cn } from './utils';

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Replace these with your actual image URLs (or put files in /public)
const BG_IMAGE_URL = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80'; // dark mountain landscape
const CENTER_IMAGE_URL = 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Raj&backgroundColor=b6e3f4&eyes=bulging&mouth=smile01'; // Raj avatar SVG

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [chatService, setChatService] = useState<RajChatService | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [voiceName, setVoiceName] = useState<'Puck' | 'Aoede'>('Puck');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [ripple, setRipple] = useState(false);

  const audioRecorderRef = useRef(new AudioRecorder());
  const audioStreamerRef = useRef(new AudioStreamer());
  const liveSessionRef = useRef<any>(null);
  const isUserStopRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const liveTranscriptRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const MAX_RECONNECT = 3;

  // Keep ref in sync with state to avoid stale closures
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);

  useEffect(() => {
    (async () => {
      try {
        let key: string | undefined = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!key || key === 'undefined') {
          const res = await fetch('/api/config');
          const cfg = await res.json();
          key = cfg.GEMINI_API_KEY;
        }
        if (key && key !== 'undefined') {
          setChatService(new RajChatService(key));
        } else {
          setConfigError('GEMINI_API_KEY missing! Render environment variables mein set karo.');
        }
      } catch {
        setConfigError('Server se connect nahi ho paa raha.');
      } finally {
        setIsInitializing(false);
      }
    })();
    return () => stopLive();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, liveTranscript]);

  const stopLive = useCallback(() => {
    setIsLive(false);
    setIsReconnecting(false);
    reconnectAttemptsRef.current = 0;
    audioRecorderRef.current.stop();
    audioStreamerRef.current.stop();
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch {}
      liveSessionRef.current = null;
    }
    setLiveTranscript('');
    liveTranscriptRef.current = '';
  }, []);

  const startLive = useCallback(async () => {
    if (!chatService) return;
    try {
      setIsLive(true);
      isUserStopRef.current = false;

      const sessionPromise = chatService.connectLive(voiceName, {
        onopen: () => {
          setIsReconnecting(false);
          reconnectAttemptsRef.current = 0;
          audioRecorderRef.current.start((b64) => {
            sessionPromise.then(s => {
              if (s?.sendRealtimeInput) {
                s.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
              }
            }).catch(() => {});
          }).catch(() => stopLive());
        },
        onmessage: (msg: any) => {
          // Voice switch tool call
          const toolCall = msg.serverContent?.modelTurn?.parts?.[0]?.toolCall as any;
          if (toolCall?.functionCalls?.[0]?.name === 'switchVoice') {
            const gender = toolCall.functionCalls[0].args.gender;
            setVoiceName(gender === 'female' ? 'Aoede' : 'Puck');
            isUserStopRef.current = false;
            stopLive();
            setTimeout(() => startLive(), 800);
            return;
          }

          // Audio output
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) audioStreamerRef.current.play(audioData);

          // Transcript — use ref to avoid stale closure
          const transcript =
            msg.serverContent?.outputTranscription?.text ||
            msg.serverContent?.modelTurn?.parts?.find((p: any) => p.text)?.text || '';
          if (transcript) {
            liveTranscriptRef.current += transcript;
            setLiveTranscript(liveTranscriptRef.current);
          }

          // Turn complete — save to messages
          if (msg.serverContent?.turnComplete) {
            const final = liveTranscriptRef.current;
            if (final.trim()) {
              setMessages(prev => [...prev, { role: 'model', text: final }]);
            }
            liveTranscriptRef.current = '';
            setLiveTranscript('');
          }
        },
        onerror: () => handleReconnect(),
        onclose: () => handleReconnect(),
      });

      liveSessionRef.current = await sessionPromise;
    } catch {
      handleReconnect();
    }
  }, [chatService, voiceName]);

  const handleReconnect = useCallback(() => {
    if (isUserStopRef.current) { stopLive(); return; }
    if (reconnectAttemptsRef.current < MAX_RECONNECT) {
      reconnectAttemptsRef.current++;
      setIsReconnecting(true);
      setTimeout(() => { if (!isUserStopRef.current) startLive(); }, reconnectAttemptsRef.current * 1500);
    } else {
      stopLive();
      setConfigError('Connection baar-baar toot raha hai. Page refresh karo.');
    }
  }, [startLive, stopLive]);

  const toggleLive = async () => {
    if (isLive) {
      isUserStopRef.current = true;
      stopLive();
      setRipple(false);
    } else {
      await audioStreamerRef.current.resume();
      setRipple(true);
      startLive();
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden font-display">
      {/* ── Background Image ── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* ── Ambient glow when live ── */}
      <AnimatePresence>
        {isLive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(236,72,153,0.15) 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>

      {/* ── Main layout ── */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight">Raj <span className="text-pink-400">✦</span></h1>
            <p className="text-white/40 text-xs">by Astratoonix · Lumding</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Voice toggle */}
            <button
              onClick={() => setVoiceName(v => v === 'Puck' ? 'Aoede' : 'Puck')}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all"
            >
              {voiceName === 'Puck' ? '♂ Male' : '♀ Female'}
            </button>
            {/* Status dot */}
            <div className={cn('w-2 h-2 rounded-full', chatService ? 'bg-green-400' : 'bg-red-400')} />
          </div>
        </header>

        {/* Center section — avatar + toggle button */}
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-4">

          {/* Avatar with ripple */}
          <div className="relative flex items-center justify-center">
            {/* Ripple rings */}
            {ripple && [0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-pink-400/40"
                initial={{ width: 120, height: 120, opacity: 0.6 }}
                animate={{ width: 240, height: 240, opacity: 0 }}
                transition={{ duration: 2, delay: i * 0.6, repeat: Infinity, ease: 'easeOut' }}
              />
            ))}

            {/* Avatar image */}
            <motion.div
              animate={isLive ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl shadow-pink-500/20"
            >
              <img src={CENTER_IMAGE_URL} alt="Raj" className="w-full h-full object-cover bg-gradient-to-br from-pink-500/20 to-orange-500/20" />
              {/* Live indicator ring */}
              {isLive && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-pink-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </motion.div>
          </div>

          {/* ── THE MAIN BUTTON — tap to toggle voice ── */}
          <div className="flex flex-col items-center gap-3">
            <motion.button
              onClick={toggleLive}
              disabled={isInitializing || !!configError}
              whileTap={{ scale: 0.94 }}
              className={cn(
                'relative px-10 py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-all duration-300 select-none',
                isLive
                  ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/30 border border-red-400/30'
                  : 'bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/20 hover:border-pink-400/50',
                (isInitializing || !!configError) && 'opacity-40 cursor-not-allowed'
              )}
            >
              {isInitializing ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Loading...
                </span>
              ) : isReconnecting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Reconnecting...
                </span>
              ) : isLive ? (
                <span className="flex items-center gap-2">
                  {/* Audio bars */}
                  {[0,1,2,3].map(i => (
                    <motion.span
                      key={i}
                      className="inline-block w-0.5 bg-white rounded-full"
                      animate={{ height: ['6px', '16px', '6px'] }}
                      transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                    />
                  ))}
                  <span className="ml-1">End Voice</span>
                </span>
              ) : (
                '🎙 Start Voice Chat'
              )}
            </motion.button>
            <p className="text-white/30 text-xs text-center">
              {isLive ? 'Raj sun raha hai... dobara tap karo band karne ke liye' : 'Tap karo aur Raj se baat karo'}
            </p>
          </div>

          {/* Live transcript bubble */}
          <AnimatePresence>
            {isLive && liveTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="max-w-sm w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 py-3 text-white/90 text-sm italic text-center"
              >
                <ReactMarkdown>{liveTranscript}</ReactMarkdown>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {configError && (
            <div className="max-w-sm w-full bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 text-red-200 text-xs text-center">
              {configError}
            </div>
          )}
        </div>

        {/* ── Chat history ── */}
        {messages.length > 0 && (
          <div
            ref={scrollRef}
            className="absolute bottom-0 left-0 right-0 h-56 overflow-y-auto px-4 pb-4 space-y-3 scroll-smooth"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 60%, transparent)' }}
          >
            <div className="pt-6 space-y-3">
              <AnimatePresence initial={false}>
                {messages.slice(-6).map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div className={cn(
                      'max-w-[80%] px-4 py-2 rounded-2xl text-sm',
                      msg.role === 'user'
                        ? 'bg-pink-600/80 text-white rounded-tr-none'
                        : 'bg-white/10 backdrop-blur-sm text-white/90 rounded-tl-none border border-white/10'
                    )}>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="py-3 text-center">
          <p className="text-white/20 text-[10px] tracking-widest uppercase">Made with ♥ · Astratoonix</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Sora', sans-serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}
