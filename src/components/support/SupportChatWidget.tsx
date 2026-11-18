import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Sparkles,
  X,
  Minus,
  Bot,
  RefreshCw,
} from 'lucide-react';
import { backendRequest } from '../../services/backendClient';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How do I clip a YouTube video?',
  'What video formats are supported?',
  'How do processing minutes work?',
  'Which payment provider will I use?',
  'How do I remove filler words?',
];

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Hi, I'm Vira 👋 I can help with clipping, captions, the editor, plans, and troubleshooting. What do you need?",
};

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-[#183d2d] text-white rounded-br-md'
            : 'bg-white border border-[#dfe7da] text-[#2d4233] rounded-bl-md shadow-sm'
        }`}
      >
        {!isUser && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#36764c] mb-1">
            <Bot size={11} aria-hidden="true" /> Vira
          </span>
        )}
        {message.content}
      </div>
    </div>
  );
}

export const SupportChatWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = input.trim().length > 0 && !busy && messages.length <= 24;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim().slice(0, 1500);
    if (!content || busy) return;
    setError(null);
    setInput('');
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await backendRequest<{ status: string; data: { reply: string } }>('/support/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: next.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err: any) {
      setError(err.message || 'The assistant is unavailable. Email us below — a human will reply.');
    } finally {
      setBusy(false);
    }
  };

  const panel = useMemo(
    () => (
      <div
        className="fixed bottom-24 right-5 z-50 w-[min(400px,calc(100vw-2.5rem))] rounded-3xl border border-[#dfe7da] bg-[#f4f6f1] shadow-2xl overflow-hidden mv-page"
        role="dialog"
        aria-label="Vira AI support chat"
      >
        {/* Header */}
        <div className="bg-[#0d1f15] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-[#36764c]/40 border border-[#5ea477]/40">
              <Bot size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold leading-none">Vira — AI Support</p>
              <p className="text-[10px] text-white/50 mt-0.5">
                {busy ? 'Thinking…' : 'Grounded in VireoClip · humans on email'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMessages([WELCOME])}
              aria-label="Restart conversation"
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize chat"
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="h-80 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-[#f4f6f1]">
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} />
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-white border border-[#dfe7da] rounded-2xl rounded-bl-md px-3.5 py-2.5 flex gap-1" aria-label="Assistant is typing">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-[#36764c] animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {error}
            </div>
          )}
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="px-3.5 pb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-[#c9d6c6] bg-white text-[#2d4233] hover:border-[#36764c] hover:bg-[#36764c]/5 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form
          className="border-t border-[#dfe7da] bg-white p-2.5 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about VireoClip…"
            maxLength={1500}
            aria-label="Ask the support assistant"
            className="flex-1 text-[13px] px-3 py-2 rounded-xl border border-[#dfe7da] bg-[#f8faf6] focus:outline-none focus:border-[#36764c] focus:ring-2 focus:ring-[#36764c]/20 text-[#1a2e22] placeholder:text-[#9aa89c]"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="grid size-9 place-items-center rounded-xl bg-[#183d2d] text-white hover:bg-[#22543a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </form>
        <p className="px-3 pb-2 text-[9.5px] text-[#8aa192] bg-white">
          AI answers can be imperfect — for account or billing actions, email{' '}
          <a className="underline" href="mailto:vertexdigitals07@gmail.com">
            vertexdigitals07@gmail.com
          </a>
          .
        </p>
      </div>
    ),
    [messages, busy, error, input]
  );

  return (
    <>
      {open && panel}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close support chat' : 'Open AI support chat'}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-[#183d2d] text-white shadow-2xl hover:bg-[#22543a] hover:scale-[1.03] active:scale-100 transition-all mv-lift"
      >
        {open ? <X size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
        <span className="text-sm font-bold">{open ? 'Close' : 'Ask Vira AI'}</span>
      </button>
    </>
  );
};
