import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ChevronLeft, Inbox, Layers, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/apiBase';
import { useToast } from '../../context/ToastContext';
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
import { MAIL_TAB_LABELS, MAIL_TAB_ORDER, mailTabForWorkItem } from '../../lib/workspaceMailTab';
import { GmailComposeTriggerButton } from '../office/OfficeRecordComposeDrawer';
import { OfficeThreadConversationDrawer } from '../office/OfficeThreadConversationDrawer';
import { ThreadDrawerTransactionIntel } from '../office/ThreadDrawerTransactionIntel';
import WorkspaceCoilMaterialPanel from './WorkspaceCoilMaterialPanel';
import WorkspaceEditApprovalPanel from './WorkspaceEditApprovalPanel';
import WorkspaceWorkItemPreview from './WorkspaceWorkItemPreview';

function formatInboxRowDate(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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

function officeLabel(item) {
  return item.officeLabel || item.responsibleOfficeKey || item.officeKey || 'Office';
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('reject') || s.includes('flag')) return 'text-rose-700';
  if (s.includes('approve') || s.includes('closed') || s.includes('complete')) return 'text-emerald-700';
  if (s.includes('pending') || s.includes('review') || s.includes('open')) return 'text-amber-800';
  return 'text-slate-600';
}

function WorkspaceListEmptyState() {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center bg-gradient-to-b from-slate-50/90 to-white px-6">
      <div className="max-w-sm rounded-2xl border border-slate-200/90 bg-white px-6 py-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
          <Layers size={22} strokeWidth={1.75} aria-hidden />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-800">Nothing here</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Try another folder or category tab.</p>
      </div>
    </div>
  );
}

/** Top bar when a memo / record is open — list is hidden; this returns to the list. */
function WorkspaceDetailToolbar({ onBack, title }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2.5 sm:px-3">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        aria-label="Back to inbox"
      >
        <ChevronLeft size={20} aria-hidden />
        <span className="hidden sm:inline">Inbox</span>
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{title || '—'}</span>
    </div>
  );
}

function WorkspaceIntelReadingPane({ item }) {
  const ws = useWorkspace();
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-hidden">
        <ThreadDrawerTransactionIntel
          workItem={item}
          variant="standalone"
          onManagementDecisionSuccess={() => void ws.refresh?.()}
        />
      </div>
    </div>
  );
}

/**
 * Workspace inbox: folder rail, list + category chips, full-width detail when an item is open.
 * Opening a message collapses the list; use Inbox / back to return. Row clicks stay in-page.
 */
export default function GmailStyleWorkspace({
  officeSummary = null,
  workItemsView,
  onWorkItemsViewChange,
  mailThreadId,
  onMailThreadIdChange,
  onCompose,
}) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();

  const [mailTab, setMailTab] = useState('primary');
  const [listMode, setListMode] = useState('registry');
  const [selectedWorkItem, setSelectedWorkItem] = useState(null);

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

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

  const viewItems = useMemo(() => {
    const v = String(workItemsView || 'needs_action');
    if (v === 'all') return allItems;
    if (v === 'file') return allItems.filter((item) => workItemShowsInFileTray(item, inboxCtx));
    if (v === 'unfiled') return allItems.filter((item) => workItemShowsInUnfiledTray(item, inboxCtx));
    return allItems.filter((item) => workItemNeedsActionForUser(item, userId));
  }, [allItems, userId, workItemsView, inboxCtx]);

  const tabFilteredItems = useMemo(() => {
    if (listMode !== 'registry') return [];
    if (mailTab === 'all') return viewItems;
    return viewItems.filter((item) => mailTabForWorkItem(item) === mailTab);
  }, [viewItems, mailTab, listMode]);

  const fileSections = useMemo(() => {
    if (String(workItemsView) !== 'file' || listMode !== 'registry') return [];
    return groupFileTrayItemsByCategory(tabFilteredItems.slice(0, 120));
  }, [workItemsView, listMode, tabFilteredItems]);

  const needsActionCount = useMemo(
    () => allItems.filter((item) => workItemNeedsActionForUser(item, userId)).length,
    [allItems, userId]
  );

  const unfiledCount = useMemo(
    () => allItems.filter((item) => workItemShowsInUnfiledTray(item, inboxCtx)).length,
    [allItems, inboxCtx]
  );

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    const q = mineOnly ? '?mine=1' : '';
    const { ok, data } = await apiFetch(`/api/office/threads${q}`);
    setThreadsLoading(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not load threads.', { variant: 'error' });
      setThreads([]);
      return;
    }
    setThreads(Array.isArray(data.threads) ? data.threads : []);
  }, [mineOnly, showToast]);

  useEffect(() => {
    if (listMode !== 'memos') return;
    void loadThreads();
  }, [listMode, loadThreads]);

  useEffect(() => {
    if (mailThreadId) {
      setSelectedWorkItem(null);
    }
  }, [mailThreadId]);

  const clearReadingPane = useCallback(() => {
    onMailThreadIdChange?.(null);
    setSelectedWorkItem(null);
  }, [onMailThreadIdChange]);

  const onRegistryRowActivate = useCallback(
    (item) => {
      const officeTid = officeThreadIdFromWorkItem(item);
      if (officeTid) {
        onMailThreadIdChange?.(officeTid);
        return;
      }
      onMailThreadIdChange?.(null);
      setSelectedWorkItem(item);
    },
    [onMailThreadIdChange]
  );

  const navBtn = (active, onClick, icon, label, badge) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors lg:rounded-l-none lg:rounded-r-full ${
        active
          ? 'bg-teal-100/90 font-semibold text-teal-950 shadow-sm ring-1 ring-teal-200/60 lg:ring-0'
          : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
      }`}
    >
      <span className={`flex w-6 shrink-0 justify-center ${active ? 'text-teal-800' : 'text-slate-500'}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && badge > 0 ? (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            active ? 'bg-white text-teal-900' : 'bg-slate-200/80 text-slate-700'
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );

  const detailOpen = Boolean(mailThreadId || selectedWorkItem);
  const detailTitle = useMemo(() => {
    if (selectedWorkItem) return String(selectedWorkItem.title || '').trim() || 'Record';
    if (mailThreadId) {
      const t = threads.find((x) => x.id === mailThreadId);
      if (t?.subject) return String(t.subject);
      return 'Memo';
    }
    return '';
  }, [mailThreadId, selectedWorkItem, threads]);

  const readingInner = mailThreadId ? (
    <OfficeThreadConversationDrawer variant="inline" threadId={mailThreadId} isOpen onDismiss={clearReadingPane} />
  ) : selectedWorkItem ? (
    (() => {
      const dt = String(selectedWorkItem.documentType || '').trim().toLowerCase();
      const sk = String(selectedWorkItem.sourceKind || '').trim().toLowerCase();
      const onDone = () => void ws.refresh?.();
      if (dt === 'edit_approval') {
        return <WorkspaceEditApprovalPanel item={selectedWorkItem} onDone={onDone} />;
      }
      if (dt === 'material_request') {
        return <WorkspaceCoilMaterialPanel item={selectedWorkItem} onDone={onDone} />;
      }
      if (workItemShowsOfficeDrawerTransactionIntel(dt)) {
        return <WorkspaceIntelReadingPane item={selectedWorkItem} />;
      }
      return (
        <WorkspaceWorkItemPreview
          item={selectedWorkItem}
          onOpenThread={(tid) => {
            setSelectedWorkItem(null);
            onMailThreadIdChange?.(tid);
          }}
        />
      );
    })()
  ) : null;

  const renderRegistryRows = () => {
    if (String(workItemsView) === 'file' || String(workItemsView) === 'unfiled') {
      if (fileSections.length === 0) {
        return <WorkspaceListEmptyState />;
      }
      return (
        <div className="divide-y divide-slate-100">
          {fileSections.map((section) => (
            <div key={section.category} className="px-1 py-3">
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{section.category}</p>
              {section.groups.map((g) => (
                <div key={`${section.category}-${g.subcategory}`} className="mb-3">
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase text-slate-400">{g.subcategory}</p>
                  <ul>
                    {g.items.map((item) => (
                      <MemoRow
                        key={item.id}
                        item={item}
                        mailThreadId={mailThreadId}
                        selectedWorkItemId={selectedWorkItem?.id}
                        onActivate={onRegistryRowActivate}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    const slice = tabFilteredItems.slice(0, 80);
    if (slice.length === 0) {
      return <WorkspaceListEmptyState />;
    }
    return (
      <ul className="divide-y divide-slate-100">
        {slice.map((item) => (
          <MemoRow
            key={item.id}
            item={item}
            mailThreadId={mailThreadId}
            selectedWorkItemId={selectedWorkItem?.id}
            onActivate={onRegistryRowActivate}
          />
        ))}
      </ul>
    );
  };

  return (
    <div className="max-w-full min-w-0 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
      <div className="flex h-[min(72vh,820px)] min-h-[420px] w-full min-w-0 flex-col bg-white lg:flex-row">
        <aside className="z-scroll-x flex w-full max-w-full shrink-0 flex-row gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-2 py-2 lg:w-56 lg:flex-col lg:gap-0 lg:overflow-x-visible lg:border-b-0 lg:border-r lg:px-0 lg:py-3">
          <div className="flex shrink-0 flex-col gap-2 px-2 pb-2 lg:px-3">
            <GmailComposeTriggerButton onClick={() => onCompose?.()} className="shrink-0 lg:w-full" />
          </div>
          <nav className="flex min-w-0 flex-1 flex-row lg:flex-col lg:gap-0.5" aria-label="Workspace inbox folders">
            {navBtn(
              workItemsView === 'needs_action' && listMode === 'registry',
              () => {
                clearReadingPane();
                setListMode('registry');
                onWorkItemsViewChange?.('needs_action');
              },
              <Inbox size={18} />,
              'Action inbox',
              needsActionCount
            )}
            {navBtn(
              workItemsView === 'all' && listMode === 'registry',
              () => {
                clearReadingPane();
                setListMode('registry');
                onWorkItemsViewChange?.('all');
              },
              <Mail size={18} />,
              'Tray',
              null
            )}
            {navBtn(
              workItemsView === 'file' && listMode === 'registry',
              () => {
                clearReadingPane();
                setListMode('registry');
                onWorkItemsViewChange?.('file');
              },
              <Archive size={18} />,
              'File',
              null
            )}
            {navBtn(
              workItemsView === 'unfiled' && listMode === 'registry',
              () => {
                clearReadingPane();
                setListMode('registry');
                onWorkItemsViewChange?.('unfiled');
              },
              <AlertTriangle size={18} />,
              'Unfiled',
              unfiledCount
            )}
            {navBtn(
              listMode === 'memos',
              () => {
                setListMode('memos');
                clearReadingPane();
              },
              <MessageSquare size={18} />,
              'Memos',
              threads.length
            )}
          </nav>
          {officeSummary ? (
            <div className="mt-auto hidden px-3 pb-2 text-[10px] text-slate-500 lg:block">
              <span className="font-mono font-semibold text-slate-700">{officeSummary.pendingActionApprox ?? 0}</span>{' '}
              pending ·{' '}
              <span className="font-mono font-semibold text-slate-700">{officeSummary.unreadApprox ?? 0}</span> unread
            </div>
          ) : null}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!detailOpen && listMode === 'registry' ? (
            <div className="z-scroll-x flex max-w-full shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2.5">
              {MAIL_TAB_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMailTab(key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    mailTab === key
                      ? 'bg-teal-100 text-teal-950 shadow-sm ring-1 ring-teal-200/70'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {MAIL_TAB_LABELS[key] || key}
                </button>
              ))}
            </div>
          ) : null}
          {!detailOpen && listMode === 'memos' ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-800">Memos</p>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={mineOnly}
                    onChange={(e) => setMineOnly(e.target.checked)}
                    className="rounded border-slate-300 text-teal-800 focus:ring-teal-600/30"
                  />
                  Mine only
                </label>
                <button
                  type="button"
                  disabled={threadsLoading}
                  onClick={() => void loadThreads()}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Refresh memos"
                >
                  <RefreshCw size={16} className={threadsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col">
            {!detailOpen ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {listMode === 'memos' ? (
                    <ul className="divide-y divide-slate-100">
                      {threadsLoading && threads.length === 0 ? (
                        <li className="px-4 py-8 text-center text-sm text-slate-500">Loading…</li>
                      ) : threads.length === 0 ? (
                        <li className="px-4 py-8 text-center text-sm text-slate-500">No threads.</li>
                      ) : (
                        threads.slice(0, 60).map((t) => {
                          const active = mailThreadId === t.id;
                          return (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedWorkItem(null);
                                  onMailThreadIdChange?.(t.id);
                                }}
                                className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors ${
                                  active ? 'bg-teal-50 ring-1 ring-inset ring-teal-100' : 'hover:bg-slate-50'
                                }`}
                              >
                                <span className="text-[13px] font-medium text-slate-900 line-clamp-1">{t.subject}</span>
                                <span className="text-[11px] text-slate-500 line-clamp-1">
                                  {t.id} · {t.status}
                                </span>
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  ) : (
                    renderRegistryRows()
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
                <WorkspaceDetailToolbar onBack={clearReadingPane} title={detailTitle} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{readingInner}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoRow({ item, mailThreadId, selectedWorkItemId, onActivate }) {
  const ref = item.referenceNo || item.id;
  const metaParts = [ref, officeLabel(item), item.branchId].filter(Boolean);
  const metaLine = metaParts.join(' · ');
  const summaryBit = item.summary ? String(item.summary).replace(/\s+/g, ' ').trim() : '';
  const preview = [metaLine, summaryBit].filter(Boolean).join(' — ') || metaLine;
  const rowDate = formatInboxRowDate(item.updatedAtIso || item.createdAtIso);
  const kindLabel = humanizeDocType(item.documentType);
  const statusClass = statusTone(item.status);
  const tab = mailTabForWorkItem(item);
  const tabLabel = MAIL_TAB_LABELS[tab] || tab;
  const tid = officeThreadIdFromWorkItem(item);
  const intelSelected =
    selectedWorkItemId === item.id && workItemShowsOfficeDrawerTransactionIntel(item.documentType);
  const selected =
    intelSelected || selectedWorkItemId === item.id || (Boolean(tid) && mailThreadId === tid);

  return (
    <li>
      <button
        type="button"
        onClick={() => onActivate(item)}
        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors md:gap-4 md:px-4 ${
          selected ? 'bg-teal-50 ring-1 ring-inset ring-teal-100/90' : 'hover:bg-slate-50'
        }`}
      >
        <div className="mt-0.5 flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-slate-900">{item.title}</span>
            {rowDate ? <span className="shrink-0 text-xs tabular-nums text-slate-500">{rowDate}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-900 ring-1 ring-teal-100">
              {tabLabel}
            </span>
            <span className={`text-xs font-medium ${statusClass}`}>
              {String(item.status || 'open').replace(/_/g, ' ')}
            </span>
          </div>
          <p className="line-clamp-2 text-[13px] leading-snug text-slate-600">
            <span className="font-medium text-slate-700">{kindLabel}</span>
            <span className="text-slate-400"> — </span>
            {preview}
          </p>
        </div>
      </button>
    </li>
  );
}
