import React from 'react';

/** Primary content surface: matches Sales / Procurement / Accounts. */
export function MainPanel({ children, className = '' }) {
  return (
    <div
      className={`relative min-h-[min(480px,55vh)] w-full min-w-0 max-w-full overflow-hidden rounded-[32px] border border-white/80 bg-white/94 p-6 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.28),0_1px_0_0_rgba(255,255,255,0.8)_inset] backdrop-blur-xl sm:min-h-[520px] sm:p-8 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-teal-50/65 to-transparent"
        aria-hidden
      />
      {children}
    </div>
  );
}
