import React from 'react';
import { Bell } from 'lucide-react';

export function WorkspaceUpdatesPanel({ officeSummary, canOffice }) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
      <div className="h-1 bg-sky-600/90" aria-hidden />
      <div className="p-6 md:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Activity</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Bell size={18} className="text-sky-600" aria-hidden />
              New updates
            </h2>
            <p className="mt-2 max-w-xl text-[11px] text-slate-500">
              Live feed and alerts will appear here. For now, use Office Desk for memos and routing.
            </p>
            {canOffice && officeSummary ? (
              <p className="mt-2 text-[11px] text-slate-600">
                Office queue (approx.):{' '}
                <span className="font-mono font-semibold text-slate-700">
                  {officeSummary.pendingActionApprox ?? 0} action · {officeSummary.unreadApprox ?? 0} unread
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-600">No feed items yet</p>
          <p className="text-xs text-slate-500">KPI-driven highlights and system notices will land in this column.</p>
        </div>
      </div>
    </section>
  );
}
