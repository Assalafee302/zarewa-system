import React from 'react';

/**
 * Standard page title + subtitle. Optional right-side slot (e.g. tab bar).
 * @param {string} [eyebrow] — Module or area label (e.g. "Human resources"); omit for minimal headers.
 */
export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <header className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between mb-6 sm:mb-8">
      <div className="min-w-0 flex gap-3 sm:gap-4">
        <span
          className="hidden sm:block w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#5eead4] via-[#2dd4bf] to-[#134e4a] self-stretch min-h-[3.25rem] shadow-sm"
          aria-hidden
        />
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5 sm:mb-2">{eyebrow}</p>
          ) : null}
          <h1 className="text-xl sm:text-3xl font-black text-[#134e4a] tracking-tight break-words">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-slate-500 font-medium text-xs sm:text-sm mt-2 normal-case tracking-normal leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="shrink-0 flex flex-wrap items-center gap-2 lg:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
