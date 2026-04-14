import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Paperclip, Pen, Send, X } from 'lucide-react';
import { SlideOverPanel } from '../layout/SlideOverPanel';
import { OfficeRecipientStrip } from './OfficeRecipientStrip';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../lib/apiBase';

/**
 * @param {{ isOpen: boolean, onDismiss?: () => void, presentation?: 'drawer' | 'gmail' }} props
 * — `gmail`: floating bottom-right compose window (non-modal), like Gmail.
 */
export function OfficeRecordComposeDrawer({ isOpen, onDismiss, presentation = 'drawer' }) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const canOffice = Boolean(ws?.canAccessModule?.('office'));
  const memoFileRef = useRef(null);
  const isGmail = presentation === 'gmail';

  const [directory, setDirectory] = useState([]);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newDocumentClass, setNewDocumentClass] = useState('correspondence');
  const [newOfficeKey, setNewOfficeKey] = useState('office_admin');
  const [newConfidentiality, setNewConfidentiality] = useState('internal');
  const [memoDate, setMemoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toIds, setToIds] = useState([]);
  const [ccIds, setCcIds] = useState([]);
  const [memoAttachments, setMemoAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [composeTemplates, setComposeTemplates] = useState([]);
  const [selectedComposeTemplateId, setSelectedComposeTemplateId] = useState('');
  const [composeTemplateFields, setComposeTemplateFields] = useState({});

  const branchNameById = useMemo(() => {
    const branches = ws?.snapshot?.workspaceBranches ?? ws?.session?.branches ?? [];
    return Object.fromEntries(
      branches.map((b) => [String(b.id || '').trim(), String(b.name || b.code || b.id || '').trim()])
    );
  }, [ws?.snapshot?.workspaceBranches, ws?.session?.branches]);

  const workspaceBranchLabel = useMemo(() => {
    const bid = String(ws?.session?.workspaceBranchId || ws?.snapshot?.workspaceBranchId || '').trim();
    return branchNameById[bid] || bid || 'Workspace branch';
  }, [ws?.session?.workspaceBranchId, ws?.snapshot?.workspaceBranchId, branchNameById]);

  const fromLine = useMemo(() => {
    const u = ws?.session?.user;
    const name = u?.displayName || u?.username || 'You';
    return `${name} · ${workspaceBranchLabel}`;
  }, [ws?.session?.user, workspaceBranchLabel]);

  const loadDirectory = useCallback(async () => {
    const { ok, data } = await apiFetch('/api/office/directory');
    if (ok && data?.ok && Array.isArray(data.users)) setDirectory(data.users);
    else setDirectory([]);
  }, []);

  const resetForm = useCallback(() => {
    setNewSubject('');
    setNewBody('');
    setNewDocumentClass('correspondence');
    setNewOfficeKey('office_admin');
    setNewConfidentiality('internal');
    setMemoDate(new Date().toISOString().slice(0, 10));
    setToIds([]);
    setCcIds([]);
    setMemoAttachments([]);
    setSelectedComposeTemplateId('');
    setComposeTemplateFields({});
    if (memoFileRef.current) memoFileRef.current.value = '';
  }, []);

  const closeCompose = useCallback(() => {
    onDismiss?.();
    resetForm();
  }, [onDismiss, resetForm]);

  const loadComposeTemplates = useCallback(async () => {
    const { ok, data } = await apiFetch('/api/office/compose-templates');
    if (ok && data?.ok && Array.isArray(data.templates)) setComposeTemplates(data.templates);
    else setComposeTemplates([]);
  }, []);

  useEffect(() => {
    if (!isOpen || !canOffice) return;
    void loadDirectory();
    void loadComposeTemplates();
  }, [isOpen, canOffice, loadDirectory, loadComposeTemplates]);

  useEffect(() => {
    if (!isOpen) resetForm();
  }, [isOpen, resetForm]);

  const addMemoFiles = (files) => {
    const list = Array.from(files || []);
    for (const f of list.slice(0, 5)) {
      if (f.size > 2.5 * 1024 * 1024) {
        showToast(`${f.name} is too large (max 2.5 MB).`, { variant: 'error' });
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const m = res.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) {
          showToast(`Could not read ${f.name}.`, { variant: 'error' });
          return;
        }
        setMemoAttachments((prev) => [...prev, { name: f.name, mime: m[1], dataBase64: m[2] }].slice(0, 5));
      };
      reader.readAsDataURL(f);
    }
    if (memoFileRef.current) memoFileRef.current.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    const subject = newSubject.trim();
    if (subject.length < 2) {
      showToast('Subject is required.', { variant: 'error' });
      return;
    }
    const selectedTpl = composeTemplates.find((t) => t.id === selectedComposeTemplateId);
    if (selectedTpl?.fields?.length) {
      for (const f of selectedTpl.fields) {
        if (!f.required) continue;
        const v = String(composeTemplateFields[f.key] ?? '').trim();
        if (!v) {
          showToast(`Fill required field: ${f.label}`, { variant: 'error' });
          return;
        }
      }
    }
    if (!ws?.canMutate) {
      showToast('Reconnect to send — workspace is read-only.', { variant: 'info' });
      return;
    }
    setSending(true);
    try {
      const { ok, data } = await apiFetch('/api/office/threads', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body: newBody.trim(),
          toUserIds: toIds,
          ccUserIds: ccIds,
          kind: 'memo',
          documentClass: newDocumentClass,
          officeKey: newOfficeKey,
          memoDateIso: memoDate,
          attachments: memoAttachments,
          payload: {
            confidentiality: newConfidentiality,
            ...(selectedComposeTemplateId
              ? {
                  composeTemplateId: selectedComposeTemplateId,
                  composeTemplateFields,
                  suggestedFilingClass: selectedTpl?.filingClass || '',
                }
              : {}),
          },
        }),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not create thread.', { variant: 'error' });
        return;
      }
      showToast('Memo sent.');
      closeCompose();
      await ws.refresh();
    } finally {
      setSending(false);
    }
  };

  const metaSelectClass = isGmail
    ? 'mt-1 w-full rounded border border-[#dadce0] bg-white px-2 py-1.5 text-[13px] text-[#202124] outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600/40'
    : 'mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm';

  const metaLabelClass = isGmail ? 'block text-[11px] font-medium text-[#5f6368]' : 'block text-[11px] font-semibold text-slate-600';

  const bodyArea = !canOffice ? (
    <div
      className={`flex-1 overflow-y-auto text-sm text-slate-600 ${isGmail ? 'px-4 py-6' : 'px-4 py-6'}`}
    >
      <p>You do not have access to Office Desk on this account.</p>
    </div>
  ) : (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${isGmail ? 'px-4 py-1 [&_.border-b]:border-[#f1f3f4]' : 'px-3 py-3 sm:px-4'}`}
      >
        <div
          className={`flex gap-3 py-2.5 ${isGmail ? 'border-b border-[#f1f3f4]' : 'border-b border-slate-200/90'}`}
        >
          <span
            className={`w-12 shrink-0 pt-2 text-right text-[13px] font-medium ${isGmail ? 'text-[#5f6368]' : 'text-slate-500'}`}
          >
            From
          </span>
          <p className={`flex-1 pt-2 text-[13px] ${isGmail ? 'text-[#202124]' : 'text-slate-900'}`}>{fromLine}</p>
        </div>
        <OfficeRecipientStrip
          label="To"
          selectedIds={toIds}
          onChange={setToIds}
          directory={directory}
          branchNameById={branchNameById}
          placeholder="Recipients…"
        />
        <OfficeRecipientStrip
          label="Cc"
          selectedIds={ccIds}
          onChange={setCcIds}
          directory={directory}
          branchNameById={branchNameById}
          placeholder="Cc…"
        />
        <div className={`flex items-center gap-3 py-2 ${isGmail ? 'border-b border-[#f1f3f4]' : 'border-b border-slate-200/90'}`}>
          <span
            className={`w-12 shrink-0 text-right text-[13px] font-medium ${isGmail ? 'text-[#5f6368]' : 'text-slate-500'}`}
          >
            Subject
          </span>
          <input
            required
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            className={`min-w-0 flex-1 border-0 border-b border-transparent bg-transparent py-2 text-[13px] outline-none ${
              isGmail
                ? 'text-[#202124] placeholder:text-[#80868b] focus:border-teal-600'
                : 'focus:border-teal-600/40'
            }`}
            placeholder="Subject"
          />
        </div>
        <div className={`grid grid-cols-1 gap-3 py-3 sm:grid-cols-2 ${isGmail ? 'border-b border-[#f1f3f4]' : 'border-b border-slate-100'}`}>
          <label className={metaLabelClass}>
            Document class
            <select value={newDocumentClass} onChange={(e) => setNewDocumentClass(e.target.value)} className={metaSelectClass}>
              <option value="correspondence">Official correspondence</option>
              <option value="request">Request</option>
              <option value="report">Report</option>
              <option value="approval">Approval submission</option>
            </select>
          </label>
          <label className={metaLabelClass}>
            Responsible office
            <select value={newOfficeKey} onChange={(e) => setNewOfficeKey(e.target.value)} className={metaSelectClass}>
              <option value="office_admin">Office administration</option>
              <option value="branch_manager">Branch manager</option>
              <option value="sales">Sales office</option>
              <option value="procurement">Procurement office</option>
              <option value="operations">Operations office</option>
              <option value="finance">Finance office</option>
              <option value="hr">HR office</option>
            </select>
          </label>
        </div>
        <div className={`grid grid-cols-1 gap-3 py-3 sm:grid-cols-2 ${isGmail ? 'border-b border-[#f1f3f4]' : 'border-b border-slate-100'}`}>
          <label className={metaLabelClass}>
            Confidentiality
            <select value={newConfidentiality} onChange={(e) => setNewConfidentiality(e.target.value)} className={metaSelectClass}>
              <option value="internal">Internal</option>
              <option value="restricted">Restricted</option>
              <option value="confidential">Confidential</option>
            </select>
          </label>
          <label className={metaLabelClass}>
            Memo date
            <input type="date" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} className={metaSelectClass} />
          </label>
        </div>
        {composeTemplates.length > 0 ? (
          <div className={`space-y-3 py-3 ${isGmail ? 'border-b border-[#f1f3f4]' : 'border-b border-slate-100'}`}>
            <label className={metaLabelClass}>
              Operations template (optional)
              <select
                value={selectedComposeTemplateId}
                onChange={(e) => {
                  setSelectedComposeTemplateId(e.target.value);
                  setComposeTemplateFields({});
                }}
                className={metaSelectClass}
              >
                <option value="">None — free-form memo</option>
                {composeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedComposeTemplateId ? (
              <p className={`text-[11px] leading-relaxed ${isGmail ? 'text-[#5f6368]' : 'text-slate-600'}`}>
                {composeTemplates.find((x) => x.id === selectedComposeTemplateId)?.summary}
              </p>
            ) : null}
            {(composeTemplates.find((x) => x.id === selectedComposeTemplateId)?.fields || []).map((f) => (
              <label key={f.key} className={metaLabelClass}>
                {f.label}
                {f.required ? <span className="text-rose-600"> *</span> : null}
                {f.type === 'number' ? (
                  <input
                    type="number"
                    className={metaSelectClass}
                    value={composeTemplateFields[f.key] ?? ''}
                    onChange={(e) =>
                      setComposeTemplateFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                ) : f.type === 'date' ? (
                  <input
                    type="date"
                    className={metaSelectClass}
                    value={composeTemplateFields[f.key] ?? ''}
                    onChange={(e) =>
                      setComposeTemplateFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    type="text"
                    className={metaSelectClass}
                    value={composeTemplateFields[f.key] ?? ''}
                    onChange={(e) =>
                      setComposeTemplateFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        ) : null}
        <div className="py-2">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={isGmail ? 10 : 8}
            placeholder="Compose email…"
            className={
              isGmail
                ? 'min-h-[200px] w-full resize-y border-0 bg-white px-0 py-2 text-[13px] leading-relaxed text-[#202124] outline-none placeholder:text-[#80868b]'
                : 'min-h-[160px] w-full rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-teal-500/20'
            }
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => memoFileRef.current?.click()}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ${
                isGmail ? 'text-[#5f6368] hover:bg-[#f1f3f4]' : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700'
              }`}
            >
              <Paperclip size={14} />
              Attach files
            </button>
            <input ref={memoFileRef} type="file" multiple className="hidden" onChange={(e) => addMemoFiles(e.target.files)} />
          </div>
          {memoAttachments.length > 0 ? (
            <ul className={`mt-2 space-y-1 text-[11px] ${isGmail ? 'text-[#5f6368]' : 'text-slate-600'}`}>
              {memoAttachments.map((a, i) => (
                <li key={`${a.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-[#d93025] hover:underline"
                    onClick={() => setMemoAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className={`pb-3 text-[11px] ${isGmail ? 'text-[#5f6368]' : 'text-slate-500'}`}>
          After sending, open the thread from{' '}
          <Link to="/" className="font-semibold text-[#134e4a] underline-offset-2 hover:underline">
            Memos
          </Link>{' '}
          on the workspace.
        </p>
      </div>
      <div
        className={`flex shrink-0 items-center gap-2 border-t px-4 py-3 ${
          isGmail ? 'justify-between border-[#f1f3f4] bg-[#f6f8fc]' : 'border-slate-200 bg-white'
        }`}
      >
        {isGmail ? (
          <button
            type="button"
            className="text-sm font-medium text-[#5f6368] hover:text-[#202124]"
            onClick={closeCompose}
          >
            Discard
          </button>
        ) : (
          <button type="button" className="z-btn-secondary flex-1 justify-center" onClick={closeCompose}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={sending}
          className={
            isGmail
              ? 'inline-flex min-w-[88px] items-center justify-center gap-2 rounded-full bg-[#134e4a] px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0f3d3a] disabled:opacity-50'
              : 'z-btn-primary flex-1 justify-center gap-2'
          }
        >
          <Send size={16} className={isGmail ? 'opacity-95' : ''} />
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );

  const drawerHeader = (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-teal-900/80">Office</p>
        <h2 className="text-base font-bold text-slate-900">New official record</h2>
      </div>
      <button type="button" onClick={closeCompose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close panel">
        <X size={20} />
      </button>
    </div>
  );

  const gmailTitleBar = (
    <div className="flex shrink-0 cursor-default items-center justify-between rounded-t-xl bg-gradient-to-r from-teal-900 to-teal-800 px-1 py-0.5 pl-3 text-white shadow-inner">
      <DialogPrimitive.Title className="text-sm font-medium tracking-tight">New memo</DialogPrimitive.Title>
      <div className="flex items-center">
        <button
          type="button"
          onClick={closeCompose}
          className="rounded p-2 text-teal-100 hover:bg-white/10"
          aria-label="Close compose"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );

  if (isGmail) {
    return (
      <DialogPrimitive.Root
        open={isOpen}
        modal={false}
        onOpenChange={(open) => {
          if (!open) closeCompose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="fixed bottom-3 right-3 z-[1090] flex w-[min(calc(100vw-1.5rem),572px)] max-h-[min(88vh,720px)] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_12px_28px_-8px_rgba(15,23,42,0.25)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-150 sm:bottom-4 sm:right-4"
          >
            <DialogPrimitive.Description className="sr-only">Compose a new internal memo</DialogPrimitive.Description>
            {gmailTitleBar}
            <div className="flex min-h-0 flex-1 flex-col bg-white">{bodyArea}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={closeCompose}
      title="New official record"
      description="Compose an internal memo or official correspondence"
      maxWidthClass="max-w-lg"
    >
      {drawerHeader}
      {bodyArea}
    </SlideOverPanel>
  );
}

export function GmailComposeTriggerButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex w-full items-center gap-3 rounded-2xl border border-teal-200/80 bg-gradient-to-br from-white to-teal-50/90 px-4 py-3 text-left text-sm font-semibold text-teal-950 shadow-sm ring-1 ring-teal-900/[0.06] transition hover:border-teal-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:pl-5 ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-800 text-white shadow-sm transition group-hover:bg-teal-900">
        <Pen size={20} strokeWidth={2} aria-hidden />
      </span>
      <span>Compose</span>
    </button>
  );
}
