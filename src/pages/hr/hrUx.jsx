/* eslint-disable react-refresh/only-export-components -- toolbar/card components plus shared statusChipClass re-export */
import React from 'react';

export { statusChipClass } from '../../hr/hrFormat';

export function HrOpsToolbar({ left, right }) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">{left}</div>
      <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">{right}</div>
    </div>
  );
}

export function HrSectionCard({ title, subtitle, actions, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-[#134e4a]">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

