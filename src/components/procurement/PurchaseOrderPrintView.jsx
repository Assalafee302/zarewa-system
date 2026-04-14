import { formatNgn } from '../../Data/mockData';
import {
  procurementKindFromPo,
  poLineBenchmarkPriceNgn,
  poLinePriceSuffix,
  poLineQtyLabel,
} from '../../lib/procurementPoKind';
import { purchaseOrderOrderedValueNgn } from '../../lib/liveAnalytics';
import { StandardReportPrintShell } from '../reports/StandardReportPrintShell';

function kindTitle(kind) {
  if (kind === 'stone') return 'Stone-coated';
  if (kind === 'accessory') return 'Accessories';
  return 'Coil';
}

function lineLineAmountNgn(line, kind) {
  const qty = Number(line?.qtyOrdered) || 0;
  const unit = poLineBenchmarkPriceNgn(line, kind);
  return Math.round(qty * unit);
}

const TH = 'px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-slate-600 print:text-[8pt]';
const TD = 'px-2 py-1.5 align-top text-[11px] text-slate-800 print:text-[10pt]';

/**
 * Printable purchase order transaction (Procurement PO preview / records).
 */
export default function PurchaseOrderPrintView({ po, printedAtIso = '' }) {
  if (!po) return null;
  const kind = procurementKindFromPo(po);
  const ordered = purchaseOrderOrderedValueNgn(po);
  const printed =
    printedAtIso && String(printedAtIso).trim()
      ? new Date(printedAtIso).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <StandardReportPrintShell
      documentTypeLabel="Internal document"
      title="Purchase order transaction"
      watermarkText="PO"
      rightColumn={
        <>
          <p className="font-mono text-lg font-bold text-slate-900 print:text-[14pt]">{po.poID}</p>
          <p className="mt-1">
            <span className="font-semibold text-[#1a3a5a]">Status</span> {po.status || '—'}
          </p>
          <p className="mt-0.5 text-slate-500">Printed {printed}</p>
        </>
      }
      footer="PO transaction record for procurement, operations, and finance. Values reflect system state at print time."
    >
      <section className="grid gap-3 border-b border-slate-100 pb-4 text-[11px] sm:grid-cols-2 print:pb-3 print:text-[10pt]">
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Supplier</p>
          <p className="mt-0.5 font-semibold text-slate-900">{po.supplierName || '—'}</p>
          {po.supplierID ? (
            <p className="font-mono text-[10px] text-slate-500">ID {po.supplierID}</p>
          ) : null}
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Kind</p>
          <p className="mt-0.5 font-semibold text-slate-900">{kindTitle(kind)}</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Order date</p>
          <p className="mt-0.5">{po.orderDateISO || '—'}</p>
        </div>
        <div>
          <p className="font-bold uppercase tracking-wide text-slate-500">Expected delivery</p>
          <p className="mt-0.5">{po.expectedDeliveryISO || '—'}</p>
        </div>
        {po.invoiceNo ? (
          <div>
            <p className="font-bold uppercase tracking-wide text-slate-500">Invoice</p>
            <p className="mt-0.5">{po.invoiceNo}</p>
          </div>
        ) : null}
        {po.deliveryDateISO ? (
          <div>
            <p className="font-bold uppercase tracking-wide text-slate-500">Delivery date</p>
            <p className="mt-0.5">{po.deliveryDateISO}</p>
          </div>
        ) : null}
      </section>

      <section className="mt-4 print:mt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
          Line items
        </p>
        <table className="quotation-print-table w-full border-collapse border border-slate-200">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className={`${TH} min-w-[40%]`}>Product</th>
              <th className={TH}>Qty</th>
              <th className={`${TH} text-right`}>Unit</th>
              <th className={`${TH} text-right`}>Line ₦</th>
            </tr>
          </thead>
          <tbody>
            {(po.lines || []).map((line) => (
              <tr key={line.lineKey || line.productID} className="quotation-print-line border-b border-slate-100">
                <td className={TD}>
                  <span className="font-mono text-[9px] text-slate-500">{line.productID}</span>
                  {line.productName ? (
                    <span className="mt-0.5 block font-medium">{line.productName}</span>
                  ) : null}
                  {[line.color, line.gauge].filter(Boolean).length ? (
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      {[line.color, line.gauge].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </td>
                <td className={`${TD} tabular-nums`}>{poLineQtyLabel(line, kind)}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {formatNgn(poLineBenchmarkPriceNgn(line, kind))}
                  {poLinePriceSuffix(kind)}
                </td>
                <td className={`${TD} text-right font-semibold tabular-nums text-[#134e4a]`}>
                  {formatNgn(lineLineAmountNgn(line, kind))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-[12px] font-black text-[#134e4a] tabular-nums print:text-[11pt]">
          Ordered value {formatNgn(ordered)}
        </p>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-3 print:mt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
          Transport & payments
        </p>
        <dl className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2 print:text-[10pt]">
          <div className="flex justify-between gap-2 sm:col-span-2">
            <dt className="text-slate-500">Agent</dt>
            <dd className="font-medium text-slate-900">{po.transportAgentName || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:col-span-2">
            <dt className="text-slate-500">Reference</dt>
            <dd className="font-medium">{po.transportReference || '—'}</dd>
          </div>
          {po.transportAmountNgn ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Transport fee (quoted)</dt>
              <dd className="font-medium tabular-nums">{formatNgn(po.transportAmountNgn)}</dd>
            </div>
          ) : null}
          {Number(po.transportAdvanceNgn) > 0 &&
          Number(po.transportAdvanceNgn) !== Number(po.transportAmountNgn) ? (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Advance (in transit)</dt>
              <dd className="font-medium tabular-nums">{formatNgn(po.transportAdvanceNgn)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Paid (treasury)</dt>
            <dd className="font-medium tabular-nums">
              {formatNgn(po.transportPaidNgn || 0)}
              {po.transportAmountNgn ? ` of ${formatNgn(po.transportAmountNgn)}` : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Transport settled</dt>
            <dd className="font-medium">{po.transportPaid ? 'Yes' : 'No'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Supplier paid</dt>
            <dd className="font-medium tabular-nums">{formatNgn(po.supplierPaidNgn || 0)}</dd>
          </div>
        </dl>
        {po.transportFinanceAdvice ? (
          <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-snug text-slate-700">
            <span className="font-semibold text-slate-600">Finance advice: </span>
            {po.transportFinanceAdvice}
          </p>
        ) : null}
        {po.transportNote ? (
          <p className="mt-2 text-[10px] leading-snug text-slate-600">
            <span className="font-semibold">Note: </span>
            {po.transportNote}
          </p>
        ) : null}
      </section>
    </StandardReportPrintShell>
  );
}
