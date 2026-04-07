import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Send } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { apiFetch } from '../lib/apiBase';

export function AiAssistantDock() {
  const ws = useWorkspace();
  const location = useLocation();
  const user = ws?.session?.user;
  const [enabled, setEnabled] = useState(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      content:
        'Ask about Zarewa workflows (quotations, receipts, procurement, production, HR, accounting). I do not see your live data—verify numbers in the app.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef(null);

  useEffect(() => {
    if (!user || user.roleKey === 'ceo') return undefined;
    let cancelled = false;
    (async () => {
      const { ok, data } = await apiFetch('/api/ai/status');
      if (cancelled) return;
      if (ok && data?.ok) setEnabled(Boolean(data.enabled));
      else setEnabled(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages, busy]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError('');
    const userMsg = { role: 'user', content: text };
    const historyForApi = [...messages, userMsg].filter((m) => m.role === 'user' || m.role === 'assistant');
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      const { ok, data } = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: historyForApi,
          context: `Path: ${location.pathname}`,
        }),
      });
      if (!ok || !data?.ok) {
        throw new Error(data?.error || 'Request failed');
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: String(data.message || '') }]);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [busy, draft, location.pathname, messages]);

  if (!user || user.roleKey === 'ceo' || enabled !== true) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
                  <p className="text-[11px] font-black uppercase tracking-wider">Assistant</p>
                  <p className="truncate text-[10px] font-medium text-teal-100/90">{location.pathname}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-white/90 transition hover:bg-white/10"
                aria-label="Close assistant"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
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
                Powered by your configured AI provider. Not financial or legal advice.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
