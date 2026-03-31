import React from 'react';

const tabBtn =
  'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all flex items-center gap-2 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

/**
 * Segmented control used across module pages for consistent UX.
 * tabs: [{ id: string, label: string, icon?: ReactNode }]
 */
export function PageTabs({ tabs, value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Section"
      className="inline-flex flex-wrap gap-1 p-1.5 rounded-2xl border border-white/80 bg-white/88 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.35)] backdrop-blur-xl"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`${tabBtn} ${
              active
                ? 'bg-[#134e4a] text-white shadow-lg shadow-teal-950/15'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#134e4a]'
            }`}
          >
            {tab.icon ?? null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
