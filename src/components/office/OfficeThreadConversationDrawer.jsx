import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { ModalFrame } from '../layout/ModalFrame';
import { ExpenseRequestFormFields } from './ExpenseRequestFormFields';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';
import { formatNgn } from '../../Data/mockData';
import { buildOfficeInternalMemoPackHtml } from '../../lib/officeMemoPackPrint.js';
import { escapeHtml, openPrintHtmlDocument, openPrintWindow } from '../../lib/officeDeskPrint.js';
import {
  buildPaymentRequestBodyFromForm,
  initialExpenseRequestFormState,
} from '../../lib/expenseRequestFormCore.js';
import { suggestExpenseCategoryFromMemoText } from '../../lib/officeDesk/expenseCategorySuggestions.js';
import { ThreadDrawerTransactionIntel } from './ThreadDrawerTransactionIntel';
import { workItemShowsOfficeDrawerTransactionIntel } from '../../lib/transactionIntelFromWorkItem';

/**
 * @param {{ threadId?: string, isOpen?: boolean, onDismiss?: () => void, variant?: 'modal' | 'inline' }} props
 */
export function OfficeThreadConversationDrawer({ threadId, isOpen = true, onDismiss, variant = 'modal' }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const canOffice = Boolean(ws?.canAccessModule?.('office'));
  const payFileRef = useRef(null);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyPolishBusy, setReplyPolishBusy] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [threadFiling, setThreadFiling] = useState(null);
  const [filingAnalyzeBusy, setFilingAnalyzeBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(() => initialExpenseRequestFormState());

  const nameByUserId = useMemo(() => {
    const m = {};
    for (const u of directory) {
      m[u.id] = u.displayName || u.username || u.id;
    }
    return m;
  }, [directory]);

  const selectedThread = detail?.thread || null;
  const selectedThreadWorkItem = useMemo(() => {
    const wid = detail?.thread?.relatedWorkItemId;
    if (!wid) return detail?.workItem || null;
    return ws?.getUnifiedWorkItemById?.(wid) || detail?.workItem || null;
  }, [detail?.thread?.relatedWorkItemId, detail?.workItem, ws]);

  const drawerIntelWorkItem = useMemo(() => {
    if (selectedThreadWorkItem && workItemShowsOfficeDrawerTransactionIntel(selectedThreadWorkItem.documentType)) {
      return selectedThreadWorkItem;
    }
    const pr = String(detail?.thread?.relatedPaymentRequestId || '').trim();
    const items = Array.isArray(ws?.snapshot?.unifiedWorkItems) ? ws.snapshot.unifiedWorkItems : [];
    if (pr && items.length) {
      const hit = items.find(
        (i) =>
          String(i.documentType || '').toLowerCase() === 'payment_request' &&
          (String(i.sourceId || '') === pr || String(i.referenceNo || '') === pr)
      );
      if (hit && workItemShowsOfficeDrawerTransactionIntel(hit.documentType)) return hit;
    }
    return null;
  }, [selectedThreadWorkItem, detail?.thread?.relatedPaymentRequestId, ws?.snapshot?.unifiedWorkItems]);

  const isInline = variant === 'inline';
  const hasThread = Boolean(String(threadId || '').trim());
  const panelActive = hasThread && (isInline || isOpen);
  const showDrawerTransactionIntel = Boolean(panelActive && drawerIntelWorkItem);

  const loadDirectory = useCallback(async () => {
    const { ok, data } = await apiFetch('/api/office/directory');
    if (ok && data?.ok && Array.isArray(data.users)) setDirectory(data.users);
    else setDirectory([]);
  }, []);

  const loadFilingForThread = useCallback(async (id) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    const fr = await apiFetch(`/api/office/threads/${encodeURIComponent(tid)}/filing`);
    if (fr.ok && fr.data?.ok) setThreadFiling(fr.data.filing || null);
    else setThreadFiling(null);
  }, []);

  const loadThread = useCallback(
    async (id) => {
      if (!id) return;
      setLoading(true);
      setThreadFiling(null);
      const { ok, data } = await apiFetch(`/api/office/threads/${encodeURIComponent(id)}`);
      setLoading(false);
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not load thread.', { variant: 'error' });
        setDetail(null);
        return;
      }
      setDetail(data);
      await apiFetch(`/api/office/threads/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      void loadFilingForThread(id);
    },
    [showToast, loadFilingForThread]
  );

  useEffect(() => {
    if (!panelActive || !threadId) return;
    void loadDirectory();
    void loadThread(threadId);
  }, [panelActive, threadId, loadDirectory, loadThread]);

  useEffect(() => {
    const shouldReset = isInline ? !hasThread : !isOpen;
    if (!shouldReset) return;
    setDetail(null);
    setReplyText('');
    setLoading(false);
    setSending(false);
    setReplyPolishBusy(false);
    setThreadFiling(null);
    setFilingAnalyzeBusy(false);
    setConvertOpen(false);
    setExpenseForm(initialExpenseRequestFormState());
    if (payFileRef.current) payFileRef.current.value = '';
  }, [isOpen, isInline, hasThread]);

  const threadPayload = detail?.thread?.payload || {};
  const attachmentList = Array.isArray(threadPayload.attachments) ? threadPayload.attachments : [];

  const printThreadView = useCallback(() => {
    if (!detail?.thread) return;
    const t = detail.thread;
    const p = t.payload || {};
    const workMeta = selectedThreadWorkItem
      ? [
          `Work item: ${selectedThreadWorkItem.referenceNo || selectedThreadWorkItem.id}`,
          selectedThreadWorkItem.documentClass ? `Class: ${selectedThreadWorkItem.documentClass}` : null,
          selectedThreadWorkItem.responsibleOfficeKey ? `Office: ${selectedThreadWorkItem.responsibleOfficeKey}` : null,
          selectedThreadWorkItem.keyDecisionSummary ? `Key decision: ${selectedThreadWorkItem.keyDecisionSummary}` : null,
        ]
          .filter(Boolean)
          .join('<br/>')
      : '';
    const lines = (detail.messages || [])
      .map((m) => {
        const who =
          m.kind === 'system' ? 'System' : nameByUserId[m.authorUserId] || m.authorUserId || '—';
        const when = m.createdAtIso ? new Date(m.createdAtIso).toLocaleString() : '';
        return `<div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;"><div style="font-size:11px;color:#64748b;">${escapeHtml(who)} · ${escapeHtml(when)}</div><div class="body">${escapeHtml(m.body)}</div></div>`;
      })
      .join('');
    const meta = [
      `Thread: ${t.id}`,
      workMeta || null,
      p.memoDateIso ? `Memo date: ${p.memoDateIso}` : null,
      p.uploadedAtIso ? `Uploaded: ${new Date(p.uploadedAtIso).toLocaleString()}` : null,
    ]
      .filter(Boolean)
      .join('<br/>');
    const html = `<h1>${escapeHtml(t.subject)}</h1><div class="meta">${meta}</div>${lines}`;
    if (!openPrintWindow(t.subject || 'Memo', html)) showToast('Allow pop-ups to print.', { variant: 'info' });
  }, [detail, nameByUserId, selectedThreadWorkItem, showToast]);

  const printCasePack = useCallback(() => {
    if (!detail?.thread) return;
    const t = detail.thread;
    const p = t.payload || {};
    const work = selectedThreadWorkItem;
    const filingFacts = threadFiling?.keyFacts
      ? Object.entries(threadFiling.keyFacts)
          .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`)
          .join('')
      : '';
    const timeline = (detail.messages || [])
      .map((m) => {
        const who = m.kind === 'system' ? 'System update' : nameByUserId[m.authorUserId] || m.authorUserId || '—';
        const when = m.createdAtIso ? new Date(m.createdAtIso).toLocaleString() : '';
        return `<div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;"><div style="font-size:11px;color:#64748b;">${escapeHtml(who)} · ${escapeHtml(when)}</div><div class="body">${escapeHtml(m.body)}</div></div>`;
      })
      .join('');
    const html = `
      <h1>Case pack</h1>
      <div class="meta">
        Subject: ${escapeHtml(t.subject)}<br/>
        Thread: ${escapeHtml(t.id)}<br/>
        ${work ? `Official record: ${escapeHtml(work.referenceNo || work.id)}<br/>` : ''}
        ${work?.documentClass ? `Class: ${escapeHtml(work.documentClass)}<br/>` : ''}
        ${work?.confidentiality ? `Confidentiality: ${escapeHtml(work.confidentiality)}<br/>` : ''}
        ${work?.responsibleOfficeKey ? `Office: ${escapeHtml(work.responsibleOfficeKey)}<br/>` : ''}
        ${p.memoDateIso ? `Memo date: ${escapeHtml(p.memoDateIso)}<br/>` : ''}
        ${p.uploadedAtIso ? `Uploaded: ${escapeHtml(new Date(p.uploadedAtIso).toLocaleString())}<br/>` : ''}
      </div>
      ${work?.keyDecisionSummary ? `<h2>Key decision</h2><p>${escapeHtml(work.keyDecisionSummary)}</p>` : ''}
      ${threadFiling ? `<h2>Filing summary</h2><p>${escapeHtml(threadFiling.summary || '')}</p>` : ''}
      ${filingFacts ? `<ul>${filingFacts}</ul>` : ''}
      <h2>Conversation timeline</h2>
      ${timeline}
    `;
    if (!openPrintWindow(`${t.subject || 'Case'} - case pack`, html)) {
      showToast('Allow pop-ups to print.', { variant: 'info' });
    }
  }, [detail, nameByUserId, selectedThreadWorkItem, threadFiling, showToast]);

  const printInternalMemoPackA4 = useCallback(() => {
    if (!detail?.thread) return;
    const t = detail.thread;
    const html = buildOfficeInternalMemoPackHtml({
      thread: t,
      messages: detail.messages || [],
      nameByUserId,
      workItem: selectedThreadWorkItem,
      filing: threadFiling,
      relatedPaymentRequestId: t.relatedPaymentRequestId,
    });
    if (!openPrintHtmlDocument(html, t.subject || 'Internal memo pack')) {
      showToast('Allow pop-ups to print.', { variant: 'info' });
    }
  }, [detail, nameByUserId, selectedThreadWorkItem, threadFiling, showToast]);

  const analyzeAndSaveFiling = async () => {
    const id = String(threadId || '').trim();
    if (!id) return;
    setFilingAnalyzeBusy(true);
    try {
      const { ok, status, data } = await apiFetch(`/api/office/threads/${encodeURIComponent(id)}/ai-file`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!ok || !data?.ok) {
        if (status === 403 && data?.code === 'CSRF_INVALID') {
          showToast('Session security token missing. Refresh the page and try again.', { variant: 'error' });
        } else if (status === 503) {
          showToast(
            data?.error ||
              'AI is not enabled. Set ZAREWA_AI_API_KEY or OPENAI_API_KEY on the server and restart the API.',
            { variant: 'error' }
          );
        } else {
          showToast(data?.error || `Analyze failed (${status || 'network'}).`, { variant: 'error' });
        }
        return;
      }
      setThreadFiling(data.filing || null);
      showToast('Thread summarized and saved to filing cabinet.', { variant: 'info' });
    } finally {
      setFilingAnalyzeBusy(false);
    }
  };

  const onReplyPolish = async () => {
    if (!detail?.thread) return;
    const threadSub = detail.thread.subject || '';
    setReplyPolishBusy(true);
    try {
      const { ok, status, data } = await apiFetch('/api/office/ai/polish-memo', {
        method: 'POST',
        body: JSON.stringify({ subject: threadSub, body: replyText }),
      });
      if (!ok || !data?.ok) {
        if (status === 403 && data?.code === 'CSRF_INVALID') {
          showToast('Session security token missing. Refresh the page and try again.', { variant: 'error' });
        } else if (status === 503) {
          showToast(
            data?.error ||
              'AI is not enabled. Set ZAREWA_AI_API_KEY or OPENAI_API_KEY on the server and restart the API.',
            { variant: 'error' }
          );
        } else {
          showToast(data?.error || `Polish failed (${status || 'network'}).`, { variant: 'error' });
        }
        return;
      }
      const nextBody = data.body != null ? String(data.body) : replyText;
      setReplyText(nextBody);
      showToast('Reply text updated. (The model also refines the subject in context; the thread title stays the same.)', {
        variant: 'info',
      });
    } finally {
      setReplyPolishBusy(false);
    }
  };

  const sendReply = async () => {
    const text = replyText.trim();
    const id = String(threadId || '').trim();
    if (!text || !id) return;
    if (!ws?.canMutate) {
      showToast('Reconnect to send — workspace is read-only.', { variant: 'info' });
      return;
    }
    setSending(true);
    try {
      const { ok, data } = await apiFetch(`/api/office/threads/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not send.', { variant: 'error' });
        return;
      }
      setReplyText('');
      await loadThread(id);
      await ws.refresh?.();
    } finally {
      setSending(false);
    }
  };

  const convertCategoryHint = useMemo(() => {
    if (!convertOpen || !selectedThread) return { category: null, reasons: [] };
    const desc = expenseForm.description || '';
    return suggestExpenseCategoryFromMemoText({
      subject: selectedThread.subject,
      body: detail?.messages?.[0]?.body || selectedThread.body || '',
      description: desc,
    });
  }, [convertOpen, selectedThread, detail, expenseForm.description]);

  const openConvert = () => {
    if (!selectedThread) return;
    const desc = [selectedThread.subject, detail?.messages?.[0]?.body || selectedThread.body || '']
      .filter(Boolean)
      .join('\n\n');
    setExpenseForm({
      ...initialExpenseRequestFormState(),
      description: desc.slice(0, 4000),
      requestReference: `OFFICE-${selectedThread.id}`,
    });
    setConvertOpen(true);
  };

  const printConvertDraft = () => {
    const body = buildPaymentRequestBodyFromForm(expenseForm);
    const html = `
      <h1>Expense request (draft)</h1>
      <div class="meta">Reference: ${escapeHtml(body.requestReference || '—')}<br/>
      Date: ${escapeHtml(body.requestDate || '—')}<br/>
      Category: ${escapeHtml(body.expenseCategory || '—')}</div>
      <p class="body">${escapeHtml(body.description || '')}</p>
      <p>Lines: ${escapeHtml(JSON.stringify(body.lineItems || [], null, 2))}</p>
    `;
    if (!openPrintWindow('Expense request draft', html)) showToast('Allow pop-ups to print.', { variant: 'info' });
  };

  const submitConvert = async (e) => {
    e.preventDefault();
    const id = String(threadId || '').trim();
    if (!id) return;
    const ef = expenseForm;
    const expenseCategory = String(ef.expenseCategory || '').trim();
    if (!expenseCategory) {
      showToast('Select an expense category.', { variant: 'error' });
      return;
    }
    const lineItems = ef.lines
      .map((row) => {
        const item = String(row.item || '').trim();
        const unit = Number.parseFloat(String(row.unit ?? '').replace(/,/g, ''));
        const unitPriceNgn = Number(row.unitPriceNgn);
        return { item, unit, unitPriceNgn };
      })
      .filter((r) => r.item && r.unit > 0 && Number.isFinite(r.unitPriceNgn) && r.unitPriceNgn >= 0);
    if (lineItems.length < 1) {
      showToast('Add at least one line item.', { variant: 'error' });
      return;
    }
    const body = buildPaymentRequestBodyFromForm(ef);
    const { ok, data } = await apiFetch(
      `/api/office/threads/${encodeURIComponent(id)}/convert-payment-request`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not convert.', { variant: 'error' });
      return;
    }
    showToast(`Payment request ${data.requestID} created — approve under Accounts.`);
    setConvertOpen(false);
    if (payFileRef.current) payFileRef.current.value = '';
    setExpenseForm(initialExpenseRequestFormState());
    await ws.refresh?.();
    await loadThread(id);
  };

  const title = detail?.thread?.subject || 'Memo';
  const canConvert =
    detail?.thread &&
    detail.thread.status !== 'converted' &&
    detail.thread.createdByUserId === ws?.session?.user?.id;

  if (isInline && !hasThread) return null;

  const outerShellClass = isInline
    ? 'flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden border-l border-[#dadce0] bg-white'
    : `z-modal-panel flex max-h-[min(92vh,900px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ${
        showDrawerTransactionIntel ? 'max-w-[min(100%,1180px)]' : 'max-w-3xl'
      }`;

  const rowClass = [
    'flex min-h-0 flex-1 flex-col',
    showDrawerTransactionIntel
      ? isInline
        ? 'lg:flex-row lg:min-h-0'
        : 'min-h-[50vh] lg:max-h-[min(92vh,900px)] lg:flex-row'
      : !isInline
        ? 'min-h-[50vh]'
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  const threadShell = (
    <div className={outerShellClass}>
      <div className={rowClass}>
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${showDrawerTransactionIntel ? 'lg:border-r lg:border-slate-200' : ''}`}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-teal-900/80">Memo</p>
                <h2
                  className={
                    isInline
                      ? 'line-clamp-2 text-[22px] font-normal leading-snug text-[#202124]'
                      : 'line-clamp-2 text-base font-bold text-[#134e4a]'
                  }
                >
                  {title}
                </h2>
                {detail?.thread?.id ? (
                  <p className="mt-1 font-mono text-[10px] text-slate-500">{detail.thread.id}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={loading || !threadId}
                  onClick={() => threadId && void loadThread(threadId)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  title="Refresh thread"
                  aria-label="Refresh thread"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss?.()}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {!canOffice ? (
              <div className="flex-1 overflow-y-auto px-4 py-6 text-sm text-slate-600">
                <p>You do not have access to internal correspondence (office.use).</p>
              </div>
            ) : loading && !detail ? (
              <div className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-slate-500">Loading…</div>
            ) : !detail?.thread ? (
              <div className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-slate-500">
                Could not load thread.
              </div>
            ) : (
              <>
              <div className="shrink-0 space-y-3 border-b border-slate-100 px-4 py-3">
                <p className="text-[10px] text-slate-500 capitalize">
                  {detail.thread.documentClass || 'correspondence'} · {detail.thread.officeKey || 'office_admin'}
                  {detail.thread.relatedWorkItemId ? ` · ${detail.thread.relatedWorkItemId}` : ''}
                </p>
                {selectedThreadWorkItem?.keyDecisionSummary ? (
                  <p className="text-[10px] text-amber-800">
                    Key decision: <strong>{selectedThreadWorkItem.keyDecisionSummary}</strong>
                  </p>
                ) : null}
                {selectedThreadWorkItem?.confidentiality ? (
                  <p className="text-[10px] text-slate-500 capitalize">{selectedThreadWorkItem.confidentiality}</p>
                ) : null}
                {(threadPayload.memoDateIso || threadPayload.uploadedAtIso) && (
                  <p className="text-[11px] text-slate-600">
                    {threadPayload.memoDateIso ? (
                      <span>
                        Memo date: <strong>{threadPayload.memoDateIso}</strong>
                      </span>
                    ) : null}
                    {threadPayload.memoDateIso && threadPayload.uploadedAtIso ? ' · ' : null}
                    {threadPayload.uploadedAtIso ? (
                      <span>
                        Sent / uploaded:{' '}
                        <strong>{new Date(threadPayload.uploadedAtIso).toLocaleString()}</strong>
                      </span>
                    ) : null}
                  </p>
                )}
                {attachmentList.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {attachmentList.map((a, i) => (
                      <a
                        key={`${a.name}-${i}`}
                        href={`data:${a.mime};base64,${a.dataBase64}`}
                        download={a.name || `attachment-${i + 1}`}
                        className="text-[11px] font-semibold text-[#134e4a] underline"
                      >
                        {a.name || 'Attachment'}
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={filingAnalyzeBusy}
                    onClick={() => void analyzeAndSaveFiling()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-black uppercase text-violet-900 disabled:opacity-40"
                  >
                    <Sparkles size={14} className={filingAnalyzeBusy ? 'animate-pulse' : ''} />
                    {filingAnalyzeBusy ? 'Analyzing…' : 'Analyze & save to filing'}
                  </button>
                  <button
                    type="button"
                    onClick={printThreadView}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700"
                  >
                    <Printer size={14} />
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={printCasePack}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700"
                  >
                    <Printer size={14} />
                    Case pack
                  </button>
                  <button
                    type="button"
                    onClick={printInternalMemoPackA4}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#134e4a]/30 bg-[#f0fdfa] px-3 py-2 text-[10px] font-black uppercase text-[#134e4a]"
                  >
                    <Printer size={14} />
                    Full internal pack (A4)
                  </button>
                  {canConvert ? (
                    <button
                      type="button"
                      onClick={() => openConvert()}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase text-amber-900"
                    >
                      <ArrowLeftRight size={14} />
                      Convert to expense
                    </button>
                  ) : null}
                </div>
                <p className="text-[10px] text-slate-500">
                  When this memo is linked to a payment request, <strong>approval</strong> and{' '}
                  <strong>treasury payment</strong> updates from Accounts appear here automatically.
                </p>
              </div>

              {threadFiling ? (
                <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                  <div className="rounded-xl border border-teal-100 bg-teal-50/40 px-3 py-2 text-[11px] text-slate-800">
                    <p className="mb-1 text-[9px] font-black uppercase text-teal-800">Filing card (saved)</p>
                    <p className="font-semibold capitalize">{threadFiling.categoryLabel || threadFiling.categoryKey}</p>
                    {threadFiling.costNgn != null ? (
                      <p className="mt-0.5 text-slate-700">Cost noted: {formatNgn(threadFiling.costNgn)}</p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap text-slate-600">{threadFiling.summary}</p>
                    {threadFiling.keyFacts && Object.keys(threadFiling.keyFacts).length > 0 ? (
                      <ul className="mt-2 list-disc pl-4 text-[10px] text-slate-600">
                        {Object.entries(threadFiling.keyFacts).map(([k, v]) => (
                          <li key={k}>
                            <strong className="font-semibold">{k}:</strong> {String(v)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-[9px] text-slate-400">
                      Last updated{' '}
                      {threadFiling.updatedAtIso ? new Date(threadFiling.updatedAtIso).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <ul className="space-y-3">
                  {(detail.messages || []).map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-xl px-3 py-2 text-[13px] ${
                        m.kind === 'system'
                          ? 'border border-amber-100 bg-amber-50 text-amber-950'
                          : 'border border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <p className="mb-1 text-[9px] font-bold uppercase text-slate-400">
                        {m.kind === 'system'
                          ? 'System update'
                          : nameByUserId[m.authorUserId] || m.authorUserId || '—'}{' '}
                        · {m.createdAtIso ? new Date(m.createdAtIso).toLocaleString() : ''}
                      </p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={replyPolishBusy || !replyText.trim()}
                    onClick={() => void onReplyPolish()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[10px] font-black uppercase text-violet-900 disabled:opacity-40"
                  >
                    <Sparkles size={12} className={replyPolishBusy ? 'animate-pulse' : ''} />
                    {replyPolishBusy ? 'Polishing…' : 'AI polish reply'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    placeholder="Reply…"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#134e4a]/15"
                  />
                  <button
                    type="button"
                    disabled={sending || !replyText.trim()}
                    onClick={() => void sendReply()}
                    className="h-11 shrink-0 self-end rounded-xl bg-[#134e4a] px-4 py-2 text-white disabled:opacity-40"
                    aria-label="Send reply"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
          {showDrawerTransactionIntel ? (
            <ThreadDrawerTransactionIntel workItem={drawerIntelWorkItem} />
          ) : null}
        </div>
        </div>
  );

  return (
    <>
      {isInline ? (
        threadShell
      ) : (
        <ModalFrame
          isOpen={isOpen}
          onClose={() => onDismiss?.()}
          title={title}
          description="Internal correspondence — read, reply, and print"
        >
          {threadShell}
        </ModalFrame>
      )}

      <ModalFrame isOpen={convertOpen} onClose={() => setConvertOpen(false)} title="Convert to expense">
        <div className="z-modal-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 className="pr-8 text-xl font-bold text-[#134e4a]">Convert to expense payment request</h3>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={printConvertDraft}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-700"
              >
                <Printer size={14} />
                Print
              </button>
              <button
                type="button"
                onClick={() => setConvertOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
          </div>
          <ExpenseRequestFormFields
            form={expenseForm}
            setForm={setExpenseForm}
            onSubmit={submitConvert}
            fileInputRef={payFileRef}
            showToast={showToast}
            formatNgn={formatNgn}
            submitLabel="Convert and submit for approval"
            categoryRecommendation={
              convertCategoryHint.category
                ? {
                    category: convertCategoryHint.category,
                    reason:
                      convertCategoryHint.reasons.length > 0
                        ? `Based on keywords in the memo (${convertCategoryHint.reasons.join(', ')}).`
                        : '',
                    onApply: () =>
                      setExpenseForm((f) => ({ ...f, expenseCategory: convertCategoryHint.category })),
                  }
                : null
            }
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setConvertOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[11px] font-black uppercase text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalFrame>
    </>
  );
}
