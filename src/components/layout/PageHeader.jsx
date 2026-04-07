import React from 'react';

/**
 * Compact module header: eyebrow + optional subtitle on the left, section tabs top-right,
 * page-level actions on a row below the tabs (not beside the table).
 * @param {string} [eyebrow] — Module or area label
 * @param {string} [title] — Document title for assistive tech only (no large visible heading)
 * @param {React.ReactNode} [tabs] — Sub-navigation (e.g. PageTabs), aligned end / top-right on sm+
 * @param {React.ReactNode} [toolbar] — Primary page actions; shown below tabs when tabs exist
 * @param {React.ReactNode} [actions] — Alias for toolbar (backward compatible)
 */
export function PageHeader({ eyebrow, title, subtitle, tabs, toolbar, actions }) {
  const bottomContent = toolbar ?? actions;
  const hasBottom = bottomContent != null && bottomContent !== false;
  const a11yTitle = title || eyebrow || 'Page';

  return (
    <header
      className={`mb-6 sm:mb-8 ${hasBottom ? 'space-y-3' : ''}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex gap-3 sm:gap-4">
          <span
            className="hidden sm:block w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#5eead4] via-[#2dd4bf] to-[#134e4a] self-stretch min-h-[2.5rem] shadow-sm"
            aria-hidden
          />
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-0.5">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="sr-only">{a11yTitle}</h1>
            {subtitle ? (
              <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-2xl mt-1">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {tabs ? (
          <div className="shrink-0 w-full sm:w-auto flex justify-start sm:justify-end min-w-0">
            {tabs}
          </div>
        ) : null}
      </div>
      {hasBottom ? (
        <div
          className={`flex flex-wrap items-center gap-2 justify-end w-full min-w-0 ${
            tabs ? 'mt-3 pt-3 border-t border-slate-100' : 'mt-1'
          }`}
        >
          {bottomContent}
        </div>
      ) : null}
    </header>
  );
}
