import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Send } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAiAssistant } from '../context/AiAssistantContext';
import { apiFetch } from '../lib/apiBase';
import { aiModeLabel, inferAiModeFromPath, quickPromptsForPath } from '../lib/aiAssistUi';

function assistantIntroForMode(mode) {
  switch (String(mode || '').toLowerCase()) {
    case 'sales':
      return 'Ask about quotations, receipts, customer follow-up, cutting-list readiness, and refunds. I use role-filtered workspace context, but you should still verify final numbers in the app.';
    case 'procurement':
      return 'Ask about suppliers, purchase orders, stock pressure, transport, and what is in transit. I can summarize live workspace context, but you should still confirm any buying decision in the app.';
    case 'operations':
      return 'Ask about stock records, production checks, coil requests, maintenance, and traceability. I can explain live exceptions, but shop-floor actions should still be confirmed in the app.';
    case 'finance':
      return 'Ask about treasury, reconciliation, payables, receipt settlement, and approval queues. I can summarize live finance context, but final posting and approval remain human decisions.';
    case 'hr':
      return 'Ask about policy acknowledgement, payroll workflow, attendance, staff files, and HR compliance. I can summarize live HR context, but legal or disciplinary decisions still need human review.';
    case 'search':
    default:
      return 'Ask what needs attention across sales, procurement, operations, finance, and HR. I use role-filtered workspace context, but you should still verify final numbers before acting.';
  }
}

function seedMessagesForMode(mode) {
  return [
    {
      role: 'assistant',
      content: assistantIntroForMode(mode),
    },
  ];
}

export function AiAssistantDock() {
  const ws = useWorkspace();
  const location = useLocation();
  const ai = useAiAssistant();
  const user = ws?.session?.user;
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState(() => inferAiModeFromPath(location.pathname));
  const [messages, setMessages] = useState(() => seedMessagesForMode(inferAiModeFromPath(location.pathname)));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const activeModeRef = useRef(activeMode);
  const pageContextRef = useRef({ pathname: location.pathname });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    pageContextRef.current = {
      ...(pageContextRef.current || {}),
      pathname: location.pathname,
    };
  }, [location.pathname]);

  const quickPrompts = useMemo(
    () =>
      quickPromptsForPath(location.pathname).filter((item) => (ai?.canUseMode ? ai.canUseMode(item.mode) : false)),
    [ai, location.pathname]
  );

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages, busy]);

  const resetConversation = useCallback((mode) => {
    const next = seedMessagesForMode(mode);
    messagesRef.current = next;
    setMessages(next);
    setError('');
  }, []);

  const sendText = useCallback(
    async (rawText, opts = {}) => {
      const text = String(rawText || '').trim();
      if (!text || busy) return;
      const mode = opts.mode || activeModeRef.current || inferAiModeFromPath(location.pathname);
      if (!ai?.canUseMode?.(mode)) {
        setError('AI assistant is not available for this area.');
        return;
      }

      let baseMessages = messagesRef.current;
      if (opts.resetConversation) {
        baseMessages = seedMessagesForMode(mode);
        messagesRef.current = baseMessages;
        setMessages(baseMessages);
      }

      const nextPageContext = {
        ...(pageContextRef.current || {}),
        ...(opts.pageContext && typeof opts.pageContext === 'object' ? opts.pageContext : {}),
        pathname: location.pathname,
      };
      pageContextRef.current = nextPageContext;
      activeModeRef.current = mode;
      setActiveMode(mode);
      setOpen(true);
      setDraft('');
      setError('');
      const userMsg = { role: 'user', content: text };
      const historyForApi = [...baseMessages, userMsg].filter((m) => m.role === 'user' || m.role === 'assistant');
      const optimistic = [...baseMessages, userMsg];
      messagesRef.current = optimistic;
      setMessages(optimistic);
      setBusy(true);
      try {
        const { ok, data } = await apiFetch('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            messages: historyForApi,
            context: `Path: ${location.pathname}`,
            mode,
            pageContext: nextPageContext,
          }),
        });
        if (!ok || !data?.ok) {
          throw new Error(data?.error || 'Request failed');
        }
        const assistantMsg = { role: 'assistant', content: String(data.message || '') };
        const nextMessages = [...messagesRef.current, assistantMsg];
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [ai, busy, location.pathname]
  );

  useEffect(() => {
    if (!open) {
      const inferred = inferAiModeFromPath(location.pathname);
      setActiveMode((prev) => (prev === inferred ? prev : inferred));
    }
  }, [location.pathname, open]);

  useEffect(() => {
    if (!ai?.request?.id) return;
    const req = ai.request;
    const nextMode =
      req.mode && ai?.canUseMode?.(req.mode) ? req.mode : activeModeRef.current || inferAiModeFromPath(location.pathname);
    const nextPageContext =
      req.pageContext && typeof req.pageContext === 'object'
        ? { ...req.pageContext, pathname: location.pathname }
        : { pathname: location.pathname };

    setOpen(true);
    setActiveMode(nextMode);
    activeModeRef.current = nextMode;
    pageContextRef.current = nextPageContext;
    if (req.resetConversation) {
      resetConversation(nextMode);
    }
    if (req.prompt) {
      if (req.autoSend === false) {
        setDraft(String(req.prompt || ''));
      } else {
        void sendText(req.prompt, {
          mode: nextMode,
          pageContext: nextPageContext,
          resetConversation: req.resetConversation,
        });
      }
    }
    ai.clearRequest?.();
  }, [ai, location.pathname, resetConversation, sendText]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    await sendText(text);
  }, [busy, draft, sendText]);

  if (!user || user.roleKey === 'ceo' || ai?.available !== true) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setActiveMode((prev) => prev || inferAiModeFromPath(location.pathname));
        }}
        className="fixed z-[170] flex h-14 w-14 items-center justify-center rounded-2xl border border-teal-200/80 bg-[#134e4a] text-[#5eead4] shadow-lg transition hover:brightness-110 active:scale-[0.98] bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))]"
        aria-label="Open AI assistant"
        title="AI assistant"
      >
        <Sparkles size={24} strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[180] flex items-end justify-end bg-slate-900/40 p-3 sm:p-4 sm:items-center sm:justify-end"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="flex h-[min(32rem,85dvh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-label="AI assistant"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 bg-[#134e4a] px-4 py-3 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={18} className="shrink-0 text-[#5eead4]" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wider">{aiModeLabel(activeMode)}</p>
                  <p className="truncate text-[10px] font-medium text-teal-100/90">{location.pathname}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => resetConversation(activeMode)}
                  className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/85 transition hover:bg-white/10"
                  aria-label="Reset assistant conversation"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-white/90 transition hover:bg-white/10"
                  aria-label="Close assistant"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
              {messages.length <= 1 && quickPrompts.length > 0 ? (
                <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#134e4a]">Quick prompts</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {quickPrompts.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() =>
                          void sendText(item.prompt, {
                            mode: item.mode,
                            pageContext: {
                              source: 'dock-quick-prompt',
                              promptLabel: item.label,
                            },
                          })
                        }
                        className="rounded-lg border border-white bg-white/90 px-2.5 py-1.5 text-[10px] font-bold text-[#134e4a] shadow-sm transition hover:bg-teal-100/80"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`rounded-xl px-3 py-2 text-[13px] leading-snug ${
                    m.role === 'user'
                      ? 'ml-6 bg-teal-50 text-[#134e4a] border border-teal-100'
                      : 'mr-4 bg-gray-50 text-gray-800 border border-gray-100'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy ? (
                <p className="text-[11px] font-semibold text-gray-400 px-1">Thinking…</p>
              ) : null}
              {error ? (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</p>
              ) : null}
              <div ref={listEndRef} />
            </div>

            <div className="border-t border-gray-100 p-3">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Message… (Enter to send, Shift+Enter for newline)"
                  className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-500/20"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={busy || !draft.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl bg-[#134e4a] text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="mt-2 text-[10px] text-gray-400 leading-snug">
                Powered by your configured AI provider. Uses role-filtered workspace context. Not financial or legal advice.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
