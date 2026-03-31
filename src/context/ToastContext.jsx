/* eslint-disable react-refresh/only-export-components -- provider + hook */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

const VARIANT = {
  success: { icon: CheckCircle2, bar: 'bg-emerald-500' },
  info: { icon: Info, bar: 'bg-[#134e4a]' },
  error: { icon: AlertCircle, bar: 'bg-rose-500' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message, opts = {}) => {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const variant = opts.variant in VARIANT ? opts.variant : 'success';
      setToasts((t) => [...t, { id, message, variant }].slice(-4));
      const ms = typeof opts.duration === 'number' ? opts.duration : 4200;
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[1100] flex flex-col gap-2 w-[min(100vw-2rem,380px)] pointer-events-none"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {toasts.map((t) => {
          const cfg = VARIANT[t.variant] ?? VARIANT.success;
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className="z-toast-item pointer-events-auto flex gap-3 rounded-2xl bg-white border border-gray-100/90 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] overflow-hidden"
              role="status"
            >
              <div className={`w-1 shrink-0 ${cfg.bar}`} aria-hidden />
              <div className="flex flex-1 items-start gap-3 py-3.5 pl-2 pr-1">
                <Icon
                  className={`shrink-0 mt-0.5 ${
                    t.variant === 'error'
                      ? 'text-rose-500'
                      : t.variant === 'info'
                        ? 'text-[#134e4a]'
                        : 'text-emerald-600'
                  }`}
                  size={20}
                  strokeWidth={2}
                />
                <p className="text-[13px] font-medium text-gray-800 leading-snug flex-1 pt-0.5">
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
