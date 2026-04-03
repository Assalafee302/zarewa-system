import { ZAREWA_COMPANY_ACCOUNT_NAME, ZAREWA_LOGO_SRC } from '../../Data/companyQuotation';

const ACCENT = '#134e4a';

function fmt(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '₦0';
  return `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function QuotationPaymentHistoryQuick({ rows = [], highlightReceiptId = '' }) {
  if (!rows.length) return null;
  return (
    <div className="my-2 border-t border-dashed border-slate-400 pt-2">
      <p className="text-[8px] font-bold uppercase text-slate-600 mb-1">All payments on this quotation</p>
      <ul className="space-y-0.5 text-[8px]">
        {rows.map((row) => {
          const isThis = highlightReceiptId && String(row.id) === String(highlightReceiptId);
          return (
            <li
              key={row.id}
              className={`flex justify-between gap-2 ${isThis ? 'font-black text-slate-900' : 'text-slate-600'}`}
            >
              <span className="min-w-0 truncate">
                {row.dateStr} · {row.id}
                {isThis ? ' · this' : ''}
              </span>
              <span className="shrink-0 tabular-nums font-semibold">{fmt(row.amountNgn)}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[7px] text-slate-500 mt-1">Ledger + imported rows; totals match books.</p>
    </div>
  );
}

/** ~80mm thermal — summary only */
export function ReceiptPrintQuick({
  receiptId = '—',
  dateStr = '—',
  customerName = '—',
  quotationRef = '—',
  quotationPaymentHistory = [],
  highlightReceiptId = '',
  lines = [],
  totalNgn = 0,
  reference = '',
}) {
  const lineSum = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const total = Number(totalNgn) || lineSum;
  return (
    <div className="receipt-print-thermal receipt-print-root text-slate-900 font-sans">
      <div className="border-b border-dashed border-slate-400 pb-2 mb-2 text-center">
        <img
          src={ZAREWA_LOGO_SRC}
          alt=""
          className="mx-auto mb-1.5 h-8 w-auto max-w-[140px] object-contain"
          width={140}
          height={32}
        />
        <p className="text-[11px] font-black uppercase tracking-tight" style={{ color: ACCENT }}>
          Zarewa — Payment
        </p>
        <p className="text-[9px] font-semibold text-slate-600 mt-1">Receipt {receiptId}</p>
        <p className="text-[9px] text-slate-500">{dateStr}</p>
      </div>
      <div className="text-[9px] space-y-1 leading-snug">
        <p>
          <span className="font-bold">Customer:</span> {customerName}
        </p>
        <p>
          <span className="font-bold">Quote:</span> {quotationRef}
        </p>
        {reference ? (
          <p>
            <span className="font-bold">Ref:</span> {reference}
          </p>
        ) : null}
      </div>
      <QuotationPaymentHistoryQuick rows={quotationPaymentHistory} highlightReceiptId={highlightReceiptId} />
      <div className="my-3 border-t border-dashed border-slate-400 pt-2 text-[9px]">
        <p className="text-[8px] font-bold uppercase text-slate-600 mb-1">This voucher</p>
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-2 py-0.5">
            <span className="min-w-0 truncate">{l.payeeName || 'Payment'}</span>
            <span className="shrink-0 font-bold tabular-nums">{fmt(l.amount)}</span>
          </div>
        ))}
      </div>
      <div className="border-t-2 border-slate-800 pt-2 flex justify-between items-baseline">
        <span className="text-[10px] font-black uppercase">Total paid</span>
        <span className="text-sm font-black tabular-nums" style={{ color: ACCENT }}>
          {fmt(total)}
        </span>
      </div>
      <p className="text-[8px] text-center text-slate-500 mt-3">Thank you</p>
    </div>
  );
}

/** A5 landscape — full detail; tuned for ~4–5 ledger rows per quotation */
export function ReceiptPrintFull({
  receiptId = '—',
  dateStr = '—',
  customerName = '—',
  customerPhone = '—',
  quotationRef = '—',
  projectName = '',
  quotationPaymentHistory = [],
  highlightReceiptId = '',
  lines = [],
  totalNgn = 0,
  reference = '',
  handledBy = '—',
}) {
  const total = Number(totalNgn) || lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return (
    <div className="receipt-print-landscape receipt-print-root rpt-full bg-white text-slate-900 antialiased">
      <header className="rpt-full-head">
        <div className="rpt-full-accent" aria-hidden />
        <div className="rpt-full-head-inner">
          <div className="rpt-full-brand">
            <div className="rpt-full-logo-ring">
              <img src={ZAREWA_LOGO_SRC} alt="" className="rpt-full-logo" width={36} height={36} />
            </div>
            <div className="rpt-full-brand-text">
              <p className="rpt-full-legal">{ZAREWA_COMPANY_ACCOUNT_NAME}</p>
              <h1 className="rpt-full-title">Official payment receipt</h1>
            </div>
          </div>
          <div className="rpt-full-refline" aria-label="Receipt identifiers">
            <span className="rpt-full-ref-item">
              <span className="rpt-full-ref-k">Receipt</span>
              <span className="rpt-full-ref-v font-mono">{receiptId}</span>
            </span>
            <span className="rpt-full-ref-dot">·</span>
            <span className="rpt-full-ref-item">
              <span className="rpt-full-ref-k">Date</span>
              <span className="rpt-full-ref-v">{dateStr}</span>
            </span>
            <span className="rpt-full-ref-dot">·</span>
            <span className="rpt-full-ref-item">
              <span className="rpt-full-ref-k">Quotation</span>
              <span className="rpt-full-ref-v font-mono">{quotationRef}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="rpt-full-grid">
        <aside className="rpt-full-aside">
          <p className="rpt-full-aside-label">Received from</p>
          <p className="rpt-full-aside-name">{customerName}</p>
          {customerPhone && customerPhone !== '—' ? (
            <p className="rpt-full-aside-phone">{customerPhone}</p>
          ) : null}
          {quotationRef && quotationRef !== '—' ? (
            <div className="rpt-full-aside-box">
              <p className="rpt-full-aside-label">Quotation</p>
              <dl className="rpt-full-aside-dl">
                <div className="rpt-full-aside-row">
                  <dt className="rpt-full-aside-dt">Reference</dt>
                  <dd className="rpt-full-aside-dd rpt-full-aside-dd-mono">{quotationRef}</dd>
                </div>
                <div className="rpt-full-aside-row">
                  <dt className="rpt-full-aside-dt">Customer</dt>
                  <dd className="rpt-full-aside-dd">{customerName}</dd>
                </div>
                <div className="rpt-full-aside-row">
                  <dt className="rpt-full-aside-dt">Project</dt>
                  <dd className="rpt-full-aside-dd">{projectName?.trim() ? projectName : '—'}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </aside>

        <div className="rpt-full-main">
          {quotationPaymentHistory.length > 0 ? (
            <section className="rpt-full-block">
              <p className="rpt-full-block-title">Payments on this quotation</p>
              <div className="rpt-full-shell">
                <table className="rpt-full-table rpt-full-table--history w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="rpt-full-th text-left">Date</th>
                      <th className="rpt-full-th text-left">Reference</th>
                      <th className="rpt-full-th text-left">Source</th>
                      <th className="rpt-full-th text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotationPaymentHistory.map((row) => {
                      const isThis = highlightReceiptId && String(row.id) === String(highlightReceiptId);
                      return (
                        <tr key={row.id} className={isThis ? 'rpt-full-tr--highlight' : ''} title={row.detail || undefined}>
                          <td className="rpt-full-td">{row.dateStr}</td>
                          <td className="rpt-full-td font-mono">
                            {row.id}
                            {isThis ? <span className="rpt-full-badge">This receipt</span> : null}
                          </td>
                          <td className="rpt-full-td rpt-full-td-muted">{row.source}</td>
                          <td className="rpt-full-td rpt-full-td-amt tabular-nums">{fmt(row.amountNgn)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="rpt-full-hint">Ledger and imported rows. Highlighted line matches this printout.</p>
            </section>
          ) : null}

          <section className="rpt-full-block rpt-full-block--lines">
            <p className="rpt-full-block-title">This receipt — allocation</p>
            <div className="rpt-full-shell rpt-full-shell--lines">
              <table className="rpt-full-table rpt-full-table--lines w-full border-collapse">
                <thead>
                  <tr>
                    <th className="rpt-full-th text-left">Payee</th>
                    <th className="rpt-full-th text-left">Account</th>
                    <th className="rpt-full-th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="rpt-full-td rpt-full-td-strong">{l.payeeName || '—'}</td>
                      <td className="rpt-full-td rpt-full-td-muted">{l.accountLabel || '—'}</td>
                      <td className="rpt-full-td rpt-full-td-amt tabular-nums">{fmt(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rpt-full-totalbar">
              <span className="rpt-full-totalbar-label">Total received</span>
              <span className="rpt-full-totalbar-amt tabular-nums">{fmt(total)}</span>
            </div>
          </section>
        </div>
      </div>

      <footer className="rpt-full-foot">
        {reference ? (
          <p className="rpt-full-foot-ref">
            <span className="rpt-full-foot-ref-k">Bank / POS reference</span> {reference}
          </p>
        ) : null}
        <p className="rpt-full-foot-by">
          Prepared by <span className="rpt-full-foot-sig">{handledBy}</span>
        </p>
      </footer>
    </div>
  );
}

export function AdvancePaymentPrintView({
  customerName = '—',
  amountNgn = 0,
  dateStr = '—',
  accountLabel = '—',
  reference = '—',
  purpose = '—',
  handledBy = '—',
}) {
  return (
    <div className="receipt-print-a6 receipt-print-root border border-amber-200 bg-amber-50/30 p-4 text-slate-900">
      <header className="border-b border-amber-300 pb-3 mb-3 flex flex-wrap items-start gap-3">
        <img
          src={ZAREWA_LOGO_SRC}
          alt=""
          className="h-10 w-10 shrink-0 object-contain print:h-9 print:w-9"
          width={40}
          height={40}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-black uppercase text-amber-900">Advance payment voucher</h1>
          <p className="text-[9px] text-amber-800/80 mt-1">Deposit — not revenue until applied to a quotation</p>
        </div>
      </header>
      <dl className="space-y-2 text-[10px]">
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Customer</dt>
          <dd className="font-semibold text-slate-900">{customerName}</dd>
        </div>
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Amount</dt>
          <dd className="text-xl font-black text-[#134e4a] tabular-nums">{fmt(amountNgn)}</dd>
        </div>
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Date</dt>
          <dd>{dateStr}</dd>
        </div>
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Received into</dt>
          <dd>{accountLabel}</dd>
        </div>
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Bank / POS reference</dt>
          <dd className="break-all">{reference || '—'}</dd>
        </div>
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Purpose</dt>
          <dd>{purpose || '—'}</dd>
        </div>
        <div>
          <dt className="font-bold text-amber-900 uppercase text-[8px]">Recorded by</dt>
          <dd>{handledBy}</dd>
        </div>
      </dl>
    </div>
  );
}
