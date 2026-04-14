import { escapeHtml } from './officeDeskPrint.js';

const ACCENT = '#1a3a5a';
const MAROON = '#7c2d12';

/**
 * Build a print-ready HTML document for an internal request memo / correspondence pack (A4).
 * Intended for official filing — includes routing, confidentiality, timeline, and writing guidance.
 *
 * @param {{
 *   thread: object;
 *   messages: object[];
 *   nameByUserId: Record<string, string>;
 *   workItem?: object | null;
 *   filing?: { summary?: string; keyFacts?: Record<string, unknown> } | null;
 *   relatedPaymentRequestId?: string | null;
 * }} input
 */
export function buildOfficeInternalMemoPackHtml(input) {
  const t = input.thread || {};
  const p = t.payload || {};
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const names = input.nameByUserId || {};
  const work = input.workItem || null;
  const filing = input.filing || null;
  const prId = String(input.relatedPaymentRequestId || t.relatedPaymentRequestId || '').trim();

  const memoDate = p.memoDateIso ? escapeHtml(p.memoDateIso) : '—';
  const conf = String(p.confidentiality || 'internal').trim();
  const confLabel = escapeHtml(conf);
  const docClass = escapeHtml(t.documentClass || 'correspondence');
  const officeKey = escapeHtml(t.officeKey || 'office_admin');
  const branch = escapeHtml(t.branchId || '—');
  const threadId = escapeHtml(t.id || '—');
  const subject = escapeHtml(t.subject || '—');
  const status = escapeHtml(t.status || 'open');

  const writerId = String(t.createdByUserId || '').trim();
  const writer = escapeHtml(names[writerId] || writerId || '—');
  const toLine = (Array.isArray(t.toUserIds) ? t.toUserIds : [])
    .map((id) => escapeHtml(names[id] || id))
    .join(', ') || '—';
  const ccLine = (Array.isArray(t.ccUserIds) ? t.ccUserIds : [])
    .map((id) => escapeHtml(names[id] || id))
    .join(', ') || '—';

  const workBlock = work
    ? `<tr><th>Official work item</th><td>${escapeHtml(work.referenceNo || work.id || '—')} · ${escapeHtml(
        String(work.documentType || '').replace(/_/g, ' ')
      )}<br/><span class="muted">Office: ${escapeHtml(
        work.responsibleOfficeKey || work.officeKey || '—'
      )}</span>${work.keyDecisionSummary ? `<br/><span class="muted">Key decision:</span> ${escapeHtml(work.keyDecisionSummary)}` : ''}</td></tr>`
    : '';

  const payBlock = prId
    ? `<tr><th>Linked payment request</th><td><strong>${escapeHtml(prId)}</strong> — see Accounts → Payment requests for approval, lines, and disbursement status.</td></tr>`
    : '';

  const attachmentRows = (Array.isArray(p.attachments) ? p.attachments : [])
    .map((a) => `<li>${escapeHtml(a?.name || 'attachment')}</li>`)
    .join('');
  const attachSection = attachmentRows
    ? `<h2>Attachments register</h2><ul class="compact">${attachmentRows}</ul>`
    : '';

  const timeline = messages
    .map((m) => {
      const who = m.kind === 'system' ? 'System' : escapeHtml(names[m.authorUserId] || m.authorUserId || '—');
      const when = m.createdAtIso ? escapeHtml(new Date(m.createdAtIso).toLocaleString()) : '—';
      const body = escapeHtml(m.body || '');
      return `<div class="msg"><div class="msgmeta">${who} · ${when}</div><div class="msgbody">${body}</div></div>`;
    })
    .join('');

  const filingFacts =
    filing?.keyFacts && typeof filing.keyFacts === 'object'
      ? Object.entries(filing.keyFacts)
          .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`)
          .join('')
      : '';
  const filingSection =
    filing && (filing.summary || filingFacts)
      ? `<h2>Filing summary (system-assisted)</h2>${filing.summary ? `<p>${escapeHtml(filing.summary)}</p>` : ''}${
          filingFacts ? `<ul class="compact">${filingFacts}</ul>` : ''
        }`
      : '';

  const guidance = `
    <h2>Internal memo — writing &amp; control checklist</h2>
    <ol class="guidance">
      <li><strong>Purpose:</strong> State what decision or action you need (not only background).</li>
      <li><strong>Facts:</strong> Who, what, when, where, amounts (₦), and document references.</li>
      <li><strong>Before / after:</strong> If operational, describe prior state vs proposed state.</li>
      <li><strong>Risk &amp; urgency:</strong> Customer impact, cash exposure, safety, or compliance.</li>
      <li><strong>Alternatives:</strong> Brief options if the approver may choose a different course.</li>
      <li><strong>Segregation:</strong> Initiator should not be sole payer/authorizer on the same cash movement.</li>
      <li><strong>Confidentiality:</strong> ${confLabel} — distribute only on a need-to-know basis.</li>
    </ol>
  `;

  const printed = escapeHtml(new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(
    t.subject || 'Internal memo pack'
  )}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.45; margin: 0; }
  .sheet { max-width: 210mm; margin: 0 auto; }
  .banner { display: flex; align-items: flex-start; gap: 12px; border-bottom: 2px solid ${ACCENT}; padding-bottom: 14px; margin-bottom: 16px; }
  .logo { width: 48px; height: 48px; border-radius: 4px; background: ${MAROON}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
  .doctype { font-size: 8pt; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 15pt; margin: 6px 0 4px; letter-spacing: 0.02em; }
  .sub { font-size: 10pt; color: #334155; margin: 0; }
  .meta { text-align: right; font-size: 9pt; color: #475569; }
  table.meta-grid { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9.5pt; }
  table.meta-grid th { text-align: left; width: 28%; border: 1px solid #e2e8f0; padding: 6px 8px; background: #f8fafc; font-weight: 700; vertical-align: top; }
  table.meta-grid td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
  h2 { font-size: 10.5pt; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; color: #0f172a; }
  .msg { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; }
  .msgmeta { font-size: 8.5pt; color: #64748b; margin-bottom: 4px; }
  .msgbody { white-space: pre-wrap; }
  ul.compact { margin: 6px 0 0 18px; }
  ol.guidance { margin: 8px 0 0 18px; }
  ol.guidance li { margin-bottom: 6px; }
  .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 8.5pt; color: #64748b; text-align: center; }
  .muted { color: #64748b; font-size: 9pt; }
</style></head><body>
<div class="sheet">
  <div class="banner">
    <div class="logo" aria-hidden="true">Z</div>
    <div style="flex:1;min-width:0;">
      <p class="doctype">Internal correspondence — full pack</p>
      <h1>${subject}</h1>
      <p class="sub">Official record for filing and audit. Not a customer-facing document.</p>
    </div>
    <div class="meta">
      <div><strong>Printed</strong><br/>${printed}</div>
      <div style="margin-top:8px;"><strong>Thread</strong><br/>${threadId}</div>
      <div style="margin-top:8px;"><strong>Status</strong><br/>${status}</div>
    </div>
  </div>

  <table class="meta-grid">
    <tr><th>Branch</th><td>${branch}</td></tr>
    <tr><th>Memo date</th><td>${memoDate}</td></tr>
    <tr><th>Classification</th><td>${confLabel}</td></tr>
    <tr><th>Document class</th><td>${docClass}</td></tr>
    <tr><th>Originating office</th><td>${officeKey}</td></tr>
    <tr><th>Writer</th><td>${writer}</td></tr>
    <tr><th>To</th><td>${toLine}</td></tr>
    <tr><th>Cc</th><td>${ccLine}</td></tr>
    ${workBlock}
    ${payBlock}
  </table>

  ${guidance}
  ${attachSection}
  <h2>Original memo &amp; correspondence trail</h2>
  ${timeline || '<p class="muted">No messages.</p>'}
  ${filingSection}

  <div class="footer">
    Confidential — internal use only. Distribution per classification. Tampering with official records is a disciplinary matter.
  </div>
</div>
</body></html>`;
}
