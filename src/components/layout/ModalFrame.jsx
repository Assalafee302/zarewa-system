import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE));
}

/**
 * Full-viewport modal shell rendered via portal (document.body).
 * Escape to close, basic focus trap, restores focus to opener.
 */
export function ModalFrame({ isOpen, onClose, children }) {
  const panelRef = useRef(null);
  const prevFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) prevFocusRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    prevFocusRef.current = document.activeElement;
    const panel = panelRef.current;
    const timer = window.requestAnimationFrame(() => {
      const nodes = getFocusable(panel);
      const first = nodes[0];
      if (first && typeof first.focus === 'function') first.focus();
      else panel?.focus?.();
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = getFocusable(panel);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(timer);
      document.removeEventListener('keydown', onKeyDown, true);
      const prevEl = prevFocusRef.current;
      if (prevEl && typeof prevEl.focus === 'function') {
        try {
          prevEl.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1060] flex items-start justify-center sm:items-center px-4 py-10 sm:px-6 sm:py-12 overflow-y-auto overscroll-contain"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/62 backdrop-blur-md transition-opacity cursor-default"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-[min(100%,1200px)] flex justify-center items-start min-h-0 outline-none rounded-[32px] shadow-[0_28px_80px_-36px_rgba(15,23,42,0.45)]"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
