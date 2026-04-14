import { ZAREWA_COMPANY_ACCOUNT_NAME } from '../../Data/companyQuotation';
import { StandardReportPrintShell } from '../reports/StandardReportPrintShell';

const TH = 'px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-slate-600 print:text-[8pt]';
const THR = `${TH} text-right`;
const TD = 'px-2 py-1.5 align-top text-[11px] text-slate-800 print:text-[10pt]';

function fmt(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '₦0';
  return `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function QuotationPaymentHistoryBlock({ rows = [], highlightReceiptId = '' }) {
  if (!rows.length) return null;
  return (
    <section className="mt-4 print:mt-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
        All payments on this quotation
      </p>
      <table className="quotation-print-table w-full border-collapse border border-slate-200">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/90">
            <th className={TH}>Date</th>
            <th className={TH}>Reference</th>
            <th className={TH}>Source</th>
            <th className={THR}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isThis = highlightReceiptId && String(row.id) === String(highlightReceiptId);
            return (
              <tr
                key={row.id}
                className={`quotation-print-line border-b border-slate-100 ${isThis ? 'bg-amber-50/80' : ''}`}
              >
                <td className={`${TD} ${isThis ? 'font-bold text-slate-900' : ''}`}>{row.dateStr}</td>
                <td className={`${TD} font-mono ${isThis ? 'font-bold' : ''}`}>
                  {row.id}
                  {isThis ? ' · this receipt' : ''}
                </td>
                <td className={`${TD} text-slate-600`}>{row.source}</td>
                <td className={`${TD} text-right font-semibold tabular-nums text-[#134e4a]`}>
                  {fmt(row.amountNgn)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[9px] text-slate-500">Ledger + imported rows; totals match books.</p>
    </section>
  );
}

/** A4 pilot layout — summary lines */
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
    <StandardReportPrintShell
      documentTypeLabel="Financial document"
      title="Payment receipt"
      subtitle="Summary"
      watermarkText="RCP"
      rightColumn={
        <>
          <p className="font-mono text-lg font-bold text-slate-900 print:text-[14pt]">{receiptId}</p>
          <p className="mt-1 text-slate-600">{dateStr}</p>
          <p className="mt-0.5 text-slate-500">Quotation {quotationRef}</p>
        </>
      }
      footer="Thank you. This voucher reflects amounts posted in Zarewa at print time."
    >
      <section className="grid gap-3 border-b border-slate-100 pb-4 text-[11px] sm:grid-cols-2 print:pb-3 print:text-[10pt]">
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Customer</p>
          <p className="mt-0.5 font-semibold text-slate-900">{customerName}</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Quotation</p>
          <p className="mt-0.5 font-mono font-medium">{quotationRef}</p>
        </div>
        {reference ? (
          <div className="sm:col-span-2">
            <p className="font-bold uppercase tracking-wide text-slate-500">Bank / POS reference</p>
            <p className="mt-0.5 break-all">{reference}</p>
          </div>
        ) : null}
      </section>

      <QuotationPaymentHistoryBlock rows={quotationPaymentHistory} highlightReceiptId={highlightReceiptId} />

      <section className="mt-4 print:mt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
          This voucher — allocation
        </p>
        <table className="quotation-print-table w-full border-collapse border border-slate-200">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className={TH}>Payee</th>
              <th className={TH}>Account</th>
              <th className={THR}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="quotation-print-line border-b border-slate-100">
                <td className={`${TD} font-medium`}>{l.payeeName || 'Payment'}</td>
                <td className={`${TD} text-slate-600`}>{l.accountLabel || '—'}</td>
                <td className={`${TD} text-right font-semibold tabular-nums text-[#134e4a]`}>{fmt(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-[12px] font-black tabular-nums text-[#134e4a] print:text-[11pt]">
          Total paid {fmt(total)}
        </p>
      </section>
    </StandardReportPrintShell>
  );
}

/** A4 pilot layout — full detail */
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
    <StandardReportPrintShell
      documentTypeLabel="Financial document"
      title="Payment receipt"
      subtitle="Full detail"
      watermarkText="RCP"
      rightColumn={
        <>
          <p className="font-mono text-lg font-bold text-slate-900 print:text-[14pt]">{receiptId}</p>
          <p className="mt-1 text-slate-600">{dateStr}</p>
          <p className="mt-0.5 font-mono text-slate-700">Quotation {quotationRef}</p>
        </>
      }
      footer={
        <>
          {reference ? (
            <span className="block">
              Bank / POS reference: <span className="font-medium text-slate-700">{reference}</span>
            </span>
          ) : null}
          <span className="mt-1 block">
            Prepared by <span className="font-semibold text-slate-600">{handledBy}</span>
          </span>
          <span className="mt-2 block text-[9px] text-slate-400">
            {ZAREWA_COMPANY_ACCOUNT_NAME}. Ledger and imported payment rows; highlighted line matches this printout.
          </span>
        </>
      }
    >
      <section className="grid gap-3 border-b border-slate-100 pb-4 text-[11px] sm:grid-cols-2 print:pb-3 print:text-[10pt]">
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Received from</p>
          <p className="mt-0.5 font-semibold text-slate-900">{customerName}</p>
          {customerPhone && customerPhone !== '—' ? (
            <p className="mt-0.5 text-slate-600">{customerPhone}</p>
          ) : null}
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Quotation</p>
          <p className="mt-0.5 font-mono font-medium">{quotationRef}</p>
          <p className="mt-1 text-slate-600">
            Project: {projectName?.trim() ? projectName : '—'}
          </p>
        </div>
      </section>

      {quotationPaymentHistory.length > 0 ? (
        <section className="mt-4 print:mt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
            Payments on this quotation
          </p>
          <table className="quotation-print-table w-full border-collapse border border-slate-200">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90">
                <th className={TH}>Date</th>
                <th className={TH}>Reference</th>
                <th className={TH}>Source</th>
                <th className={THR}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {quotationPaymentHistory.map((row) => {
                const isThis = highlightReceiptId && String(row.id) === String(highlightReceiptId);
                return (
                  <tr
                    key={row.id}
                    className={`quotation-print-line border-b border-slate-100 ${isThis ? 'bg-amber-50/80' : ''}`}
                    title={row.detail || undefined}
                  >
                    <td className={TD}>{row.dateStr}</td>
                    <td className={`${TD} font-mono`}>
                      {row.id}
                      {isThis ? (
                        <span className="ml-1 rounded bg-amber-200/80 px-1 text-[8px] font-bold uppercase text-amber-900">
                          This receipt
                        </span>
                      ) : null}
                    </td>
                    <td className={`${TD} text-slate-600`}>{row.source}</td>
                    <td className={`${TD} text-right font-semibold tabular-nums text-[#134e4a]`}>
                      {fmt(row.amountNgn)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-4 print:mt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
          This receipt — allocation
        </p>
        <table className="quotation-print-table w-full border-collapse border border-slate-200">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className={TH}>Payee</th>
              <th className={TH}>Account</th>
              <th className={THR}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="quotation-print-line border-b border-slate-100">
                <td className={`${TD} font-medium`}>{l.payeeName || '—'}</td>
                <td className={`${TD} text-slate-600`}>{l.accountLabel || '—'}</td>
                <td className={`${TD} text-right font-semibold tabular-nums text-[#134e4a]`}>{fmt(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-slate-800 pt-3">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-800 print:text-[10pt]">
            Total received
          </span>
          <span className="text-xl font-black tabular-nums text-[#134e4a] print:text-[16pt]">{fmt(total)}</span>
        </div>
      </section>
    </StandardReportPrintShell>
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
    <StandardReportPrintShell
      documentTypeLabel="Financial document"
      title="Advance payment voucher"
      subtitle="Deposit — not revenue until applied to a quotation"
      watermarkText="ADV"
      rightColumn={
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 print:text-[9pt]">Amount</p>
          <p className="mt-0.5 text-2xl font-black tabular-nums text-[#134e4a] print:text-[18pt]">{fmt(amountNgn)}</p>
          <p className="mt-2 text-slate-600">{dateStr}</p>
        </>
      }
      footer="Advance deposits are liabilities until allocated to a quotation or refunded per policy."
    >
      <section className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 text-[11px] print:border-slate-200 print:bg-white print:text-[10pt]">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Customer</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{customerName}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Date</dt>
            <dd className="mt-0.5">{dateStr}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Received into</dt>
            <dd className="mt-0.5">{accountLabel}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Bank / POS reference</dt>
            <dd className="mt-0.5 break-all">{reference || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Purpose</dt>
            <dd className="mt-0.5">{purpose || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Recorded by</dt>
            <dd className="mt-0.5">{handledBy}</dd>
          </div>
        </dl>
      </section>
    </StandardReportPrintShell>
  );
}
