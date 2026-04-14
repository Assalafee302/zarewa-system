import React from 'react';
import { officeThreadIdFromWorkItem } from '../../lib/officeThreadFromWorkItem';
import { mailTabForWorkItem, MAIL_TAB_LABELS } from '../../lib/workspaceMailTab';

function formatWhen(iso) {
  const s = String(iso || '').trim();
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

function metaRow(label, value) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-800">{value}</span>
    </div>
  );
}

/**
 * Right-pane summary for registry items without a dedicated action panel.
 */
export default function WorkspaceWorkItemPreview({ item, onOpenThread }) {
  if (!item) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-b from-slate-50/80 to-white px-6 text-center">
        <p className="text-sm text-slate-500">Select an item from the list.</p>
      </div>
    );
  }

  const tab = mailTabForWorkItem(item);
  const tabLabel = MAIL_TAB_LABELS[tab] || tab;
  const office = item.officeLabel || item.responsibleOfficeKey || item.officeKey || 'Workspace';
  const tid = officeThreadIdFromWorkItem(item);
  const ref = item.referenceNo || item.id;
  const docLabel = String(item.documentType || '').replace(/_/g, ' ') || 'Item';

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-gradient-to-r from-teal-50/50 to-white px-3 py-2">
        <span className="rounded-md bg-teal-100/90 px-2 py-0.5 text-[11px] font-semibold text-teal-950 ring-1 ring-teal-200/60">
          {tabLabel}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">Registry</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-slate-900">{item.title || '—'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{office}</span>
          <span className="text-slate-400"> · </span>
          <span className="capitalize">{docLabel}</span>
        </p>

        <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/40 px-3 py-1">
          {metaRow('Reference', ref)}
          {metaRow('Status', String(item.status || '—').replace(/_/g, ' '))}
          {item.branchId ? metaRow('Branch', String(item.branchId)) : null}
          {metaRow('Updated', formatWhen(item.updatedAtIso || item.createdAtIso))}
        </div>

        {item.summary ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Summary</p>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">{item.summary}</p>
          </div>
        ) : null}

        {tid ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => onOpenThread?.(tid)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0f3d3a]"
            >
              Open linked memo
            </button>
          </div>
        ) : (
          <p className="mt-8 text-sm leading-relaxed text-slate-600">
            This record is tracked in the workspace. When workflow tooling is added for this type, actions will appear
            here.
          </p>
        )}
      </div>
    </div>
  );
}
