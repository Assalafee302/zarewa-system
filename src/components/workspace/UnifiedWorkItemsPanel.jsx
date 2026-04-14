import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Inbox, ShieldCheck } from 'lucide-react';
import { OfficeThreadConversationDrawer } from '../office/OfficeThreadConversationDrawer';
import { ManagementIntelSlideOver } from './ManagementIntelSlideOver';
import { useWorkspace } from '../../context/WorkspaceContext';
import { officeThreadIdFromWorkItem } from '../../lib/officeThreadFromWorkItem';
import { workItemShowsOnWorkspaceUnifiedInbox } from '../../lib/workItemPersonalInbox';
import {
  groupFileTrayItemsByCategory,
  workItemNeedsActionForUser,
  workItemShowsInFileTray,
  workItemShowsInUnfiledTray,
} from '../../lib/workspaceInboxBuckets';
import { workItemShowsOfficeDrawerTransactionIntel } from '../../lib/transactionIntelFromWorkItem';

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('reject') || s.includes('flag')) return 'text-rose-700';
  if (s.includes('approve') || s.includes('closed') || s.includes('complete')) return 'text-emerald-700';
  if (s.includes('pending') || s.includes('review') || s.includes('open')) return 'text-amber-800';
  return 'text-slate-600';
}

function slaTone(state) {
  if (state === 'overdue') return 'text-rose-600';
  if (state === 'pending') return 'text-amber-700';
  return 'text-slate-500';
}

function officeLabel(item) {
  return item.officeLabel || item.responsibleOfficeKey || item.officeKey || 'Office';
}

function fallbackRoute(item) {
  if (item.routePath) return { to: item.routePath, state: item.routeState };
  if (item.linkedThreadId) return { to: '/', state: { selectedThreadId: String(item.linkedThreadId) } };
  if (item.documentType === 'payment_request') return { to: '/accounts', state: { accountsTab: 'requests' } };
  if (item.documentType === 'material_request') return { to: '/operations', state: { focusOpsTab: 'inventory' } };
  if (String(item.documentType || '').startsWith('hr_')) return { to: '/' };
  return { to: '/' };
}

function formatInboxRowDate(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function humanizeDocType(documentType) {
  return String(documentType || 'Item')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function UnifiedWorkItemsPanel({ hideFooter = false, view: viewProp = 'needs_action', onOpenMailReader }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const view = String(viewProp || 'needs_action');
  const isMailControlled = typeof onOpenMailReader === 'function';
  const [memoDrawerThreadId, setMemoDrawerThreadId] = useState(null);
  const [intelDrawerWorkItem, setIntelDrawerWorkItem] = useState(null);
  const userId = String(ws?.session?.user?.id || '').trim();
  const roleKey = ws?.session?.user?.roleKey;
  const unifiedWorkItems = ws?.snapshot?.unifiedWorkItems;
  const permissionsFromCtx = ws?.permissions;
  const { allItems, inboxCtx } = useMemo(() => {
    const raw = Array.isArray(unifiedWorkItems) ? unifiedWorkItems : [];
    const permissions = permissionsFromCtx ?? [];
    const inboxCtxInner = { userId, roleKey, permissions };
    const all = raw.filter((item) => workItemShowsOnWorkspaceUnifiedInbox(item, inboxCtxInner));
    return { allItems: all, inboxCtx: inboxCtxInner };
  }, [unifiedWorkItems, userId, roleKey, permissionsFromCtx]);
  const currentUserId = userId;
  const items = useMemo(() => {
    if (view === 'all') return allItems;
    if (view === 'file') {
      return allItems.filter((item) => workItemShowsInFileTray(item, inboxCtx));
    }
    if (view === 'unfiled') {
      return allItems.filter((item) => workItemShowsInUnfiledTray(item, inboxCtx));
    }
    return allItems.filter((item) => workItemNeedsActionForUser(item, currentUserId));
  }, [allItems, currentUserId, view, inboxCtx]);

  const fileSections = useMemo(() => {
    if (view !== 'file' && view !== 'unfiled') return [];
    return groupFileTrayItemsByCategory(items.slice(0, 100));
  }, [view, items]);

  const renderItemRow = (item) => {
    const route = fallbackRoute(item);
    const officeTid = officeThreadIdFromWorkItem(item);
    const ref = item.referenceNo || item.id;
    const metaParts = [
      ref,
      officeLabel(item),
      item.branchId,
      item.documentClass,
      String(item.documentType || '').replace(/_/g, ' ') || null,
    ].filter(Boolean);
    const metaLine = metaParts.join(' · ');
    const summaryBit = item.summary ? String(item.summary).replace(/\s+/g, ' ').trim() : '';
    const preview = [metaLine, summaryBit].filter(Boolean).join(' — ') || metaLine;
    const rowDate = formatInboxRowDate(item.updatedAtIso || item.createdAtIso);
    const initial = String(item.title || '?')
      .trim()
      .charAt(0)
      .toUpperCase();
    const kindLabel = humanizeDocType(item.documentType);
    const statusClass = statusTone(item.status);
    const sla =
      item.slaState && item.slaState !== 'n/a' ? (
        <span className={`ml-1.5 text-xs font-medium ${slaTone(item.slaState)}`}>{item.slaState}</span>
      ) : null;

    return (
      <li key={item.id} className="border-b border-[#e8eaed] last:border-b-0">
        <button
          type="button"
          onClick={() => {
            if (officeTid) {
              setIntelDrawerWorkItem(null);
              if (isMailControlled) onOpenMailReader(officeTid);
              else setMemoDrawerThreadId(officeTid);
              return;
            }
            if (workItemShowsOfficeDrawerTransactionIntel(item.documentType)) {
              setMemoDrawerThreadId(null);
              setIntelDrawerWorkItem(item);
              return;
            }
            navigate(route.to, route.state ? { state: route.state } : undefined);
          }}
          className="group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[#f2f6fc] md:gap-4 md:px-4 md:py-3.5"
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#134e4a] text-[13px] font-semibold text-white md:h-10 md:w-10"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1 truncate">
                <span className="text-[13px] font-semibold text-[#202124]">{item.title}</span>
              </div>
              {rowDate ? <span className="shrink-0 text-xs tabular-nums text-[#5f6368]">{rowDate}</span> : null}
            </div>
            <div className="mt-0.5 truncate text-[13px] leading-snug text-[#5f6368]">
              <span className="font-medium text-[#3c4043]">{kindLabel}</span>
              <span className="text-[#80868b]"> · </span>
              <span className={`text-xs font-medium ${statusClass}`}>
                {String(item.status || 'open').replace(/_/g, ' ')}
              </span>
              {sla}
              <span className="text-[#80868b]"> — </span>
              <span>{preview}</span>
            </div>
          </div>
        </button>
      </li>
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <div className="h-1 bg-[#134e4a]" aria-hidden />
      <div className="px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-5">
        <div className="mb-4 min-w-0 md:mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
          <h2 className="mt-0.5 flex items-center gap-2 text-xl font-normal tracking-tight text-[#202124]">
            <Inbox size={22} className="shrink-0 text-[#134e4a]" strokeWidth={1.75} aria-hidden />
            {view === 'file' ? 'File' : view === 'unfiled' ? 'Unfiled' : view === 'all' ? 'In tray' : 'Action inbox'}
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-[#5f6368]">
            {view === 'file'
              ? 'Closed or cleared official records you may still retrieve — no action required.'
              : view === 'unfiled'
                ? 'Completed records missing filing reference or required metadata — complete for audit readiness.'
                : view === 'all'
                  ? 'Everything routed to you or your role (including items awaiting someone else).'
                  : 'Only items that still need your approval or response right now.'}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#dadce0] bg-[#f8f9fa] px-6 py-14 text-center">
            <Inbox size={36} className="mx-auto text-[#dadce0]" strokeWidth={1.25} aria-hidden />
            <p className="mt-3 text-sm font-medium text-[#3c4043]">No messages in this view</p>
            <p className="mt-1 text-xs text-[#5f6368]">
              Try another tray tab or check back when something is routed to you.
            </p>
          </div>
        ) : view === 'file' || view === 'unfiled' ? (
          <div className="space-y-8">
            {fileSections.map((section) => (
              <div key={section.category}>
                <h3 className="mb-3 border-b border-slate-200 pb-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
                  {section.category}
                </h3>
                <div className="space-y-5">
                  {section.groups.map((g) => (
                    <div key={`${section.category}-${g.subcategory}`}>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.subcategory}</p>
                      <ul className="overflow-hidden rounded-lg border border-[#e8eaed] bg-white">
                        {g.items.map((item) => renderItemRow(item))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-[#e8eaed] bg-white">
            {items.slice(0, 25).map((item) => renderItemRow(item))}
          </ul>
        )}

        {hideFooter ? null : (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
            >
              <FileText size={14} />
              Workspace home
            </Link>
            <Link
              to="/manager"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck size={14} />
              Open management view
            </Link>
          </div>
        )}
      </div>

      {!isMailControlled ? (
        <OfficeThreadConversationDrawer
          threadId={memoDrawerThreadId || ''}
          isOpen={Boolean(memoDrawerThreadId)}
          onDismiss={() => setMemoDrawerThreadId(null)}
        />
      ) : null}
      <ManagementIntelSlideOver
        workItem={intelDrawerWorkItem}
        isOpen={Boolean(intelDrawerWorkItem)}
        onDismiss={() => setIntelDrawerWorkItem(null)}
      />
    </section>
  );
}
