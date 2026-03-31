import React from 'react';

/** Primary content surface: matches Sales / Procurement / Accounts. */
export function MainPanel({ children, className = '' }) {
  return (
    <div
      className={`relative overflow-hidden bg-white/94 backdrop-blur-xl rounded-[32px] border border-white/80 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.28),0_1px_0_0_rgba(255,255,255,0.8)_inset] p-6 sm:p-8 min-h-[min(480px,55vh)] sm:min-h-[520px] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-teal-50/65 to-transparent"
        aria-hidden
      />
      {children}
    </div>
  );
}
