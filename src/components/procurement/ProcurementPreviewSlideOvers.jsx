import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { SlideOverPanel } from '../layout/SlideOverPanel';
import { formatNgn } from '../../Data/mockData';
import PurchaseOrderPrintView from './PurchaseOrderPrintView';
import {
  procurementKindFromPo,
  poLineBenchmarkPriceNgn,
  poLinePriceSuffix,
  poLineQtyLabel,
} from '../../lib/procurementPoKind';
import { purchaseOrderOrderedValueNgn } from '../../lib/liveAnalytics';

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

const detailLabel = 'text-[9px] font-semibold text-slate-500 uppercase tracking-wide';
const detailValue = 'text-xs font-semibold text-slate-800';

const poActionBtn =
  'text-[9px] font-semibold uppercase tracking-wide px-2.5 py-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Read-only purchase order detail (Procurement → Purchases list).
 * Optional footer actions (approve, transport, transport fee, etc.).
 */
export function ProcurementPoPreviewSlideOver({
  po,
  isOpen,
  onClose,
  onEdit,
  canEdit,
  wsCanMutate = true,
  onApprove,
  onReject,
  onAssignTransport,
}) {
  const [showPrint, setShowPrint] = useState(false);
  const [printStampIso, setPrintStampIso] = useState('');

  if (!po) return null;
  const kind = procurementKindFromPo(po);
  const ordered = purchaseOrderOrderedValueNgn(po);
  const pending = po.status === 'Pending';
  const canTransport = po.status === 'Approved' || po.status === 'On loading';
  const hasWorkflowFooter =
    (canEdit && onEdit) ||
    (pending && onApprove && onReject) ||
    (canTransport && onAssignTransport);

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={po.poID ? `PO ${po.poID}` : 'Purchase order'}
      description="Purchase order details"
      maxWidthClass="max-w-[min(96vw,520px)]"
    >
      <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-50">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Purchase order</p>
            <h2 className="mt-0.5 font-mono text-lg font-bold text-[#134e4a]">{po.poID}</h2>
            <p className="text-xs font-medium text-slate-600">{po.supplierName}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {kindTitle(kind)} ·{' '}
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[#134e4a]">
                {po.status}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setPrintStampIso(new Date().toISOString());
                setShowPrint(true);
              }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-[#134e4a]"
              aria-label="Print PO"
              title="Print"
            >
              <Printer size={20} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className={`${detailLabel} mb-2`}>Dates & references</p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px]">
                <div>
                  <dt className={detailLabel}>Order date</dt>
                  <dd className={detailValue}>{po.orderDateISO || '—'}</dd>
                </div>
                <div>
                  <dt className={detailLabel}>Expected delivery</dt>
                  <dd className={detailValue}>{po.expectedDeliveryISO || '—'}</dd>
                </div>
                {po.invoiceNo ? (
                  <div>
                    <dt className={detailLabel}>Invoice</dt>
                    <dd className={detailValue}>{po.invoiceNo}</dd>
                  </div>
                ) : null}
                {po.deliveryDateISO ? (
                  <div>
                    <dt className={detailLabel}>Delivery date</dt>
                    <dd className={detailValue}>{po.deliveryDateISO}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className={`${detailLabel} mb-2`}>Lines</p>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90">
                      <th className="px-2 py-1.5 font-bold text-slate-600">Product</th>
                      <th className="px-2 py-1.5 font-bold text-slate-600">Qty</th>
                      <th className="px-2 py-1.5 font-bold text-slate-600 text-right">Unit</th>
                      <th className="px-2 py-1.5 font-bold text-slate-600 text-right">Line ₦</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(po.lines || []).map((line) => (
                      <tr key={line.lineKey || line.productID} className="tabular-nums">
                        <td className="px-2 py-1.5 text-slate-800">
                          <span className="font-mono text-[9px] text-slate-500">{line.productID}</span>
                          {line.productName ? (
                            <span className="block font-medium text-slate-700">{line.productName}</span>
                          ) : null}
                          {[line.color, line.gauge].filter(Boolean).length ? (
                            <span className="text-[9px] text-slate-500">
                              {[line.color, line.gauge].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-slate-700">{poLineQtyLabel(line, kind)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-700">
                          {formatNgn(poLineBenchmarkPriceNgn(line, kind))}
                          {poLinePriceSuffix(kind)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-[#134e4a]">
                          {formatNgn(lineLineAmountNgn(line, kind))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-[11px] font-black text-[#134e4a] tabular-nums">
                Ordered value {formatNgn(ordered)}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className={`${detailLabel} mb-2`}>Transport & settlement</p>
              <dl className="space-y-1.5 text-[11px]">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">Agent</dt>
                  <dd className="font-medium text-slate-800">{po.transportAgentName || '—'}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">Reference</dt>
                  <dd className="font-medium text-slate-800">{po.transportReference || '—'}</dd>
                </div>
                {po.transportAmountNgn ? (
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">Transport fee (quoted)</dt>
                    <dd className="font-medium text-slate-800">{formatNgn(po.transportAmountNgn)}</dd>
                  </div>
                ) : null}
                {Number(po.transportAdvanceNgn) > 0 &&
                Number(po.transportAdvanceNgn) !== Number(po.transportAmountNgn) ? (
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">Advance (in transit)</dt>
                    <dd className="font-medium text-slate-800">{formatNgn(po.transportAdvanceNgn)}</dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">Paid (treasury)</dt>
                  <dd className="font-medium text-slate-800">
                    {formatNgn(po.transportPaidNgn || 0)}
                    {po.transportAmountNgn
                      ? ` of ${formatNgn(po.transportAmountNgn)}`
                      : ''}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">Transport settled</dt>
                  <dd className="font-medium text-slate-800">{po.transportPaid ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">Supplier paid</dt>
                  <dd className="font-medium text-slate-800">{formatNgn(po.supplierPaidNgn || 0)}</dd>
                </div>
                {po.transportFinanceAdvice ? (
                  <div className="border-t border-slate-100 pt-2 mt-2">
                    <p className={detailLabel}>Finance advice (DAV)</p>
                    <p className="mt-1 text-[10px] text-slate-700 leading-snug">{po.transportFinanceAdvice}</p>
                  </div>
                ) : null}
                {po.transportNote ? (
                  <p className="text-[10px] text-slate-600 leading-snug border-t border-slate-100 pt-2 mt-2">
                    {po.transportNote}
                  </p>
                ) : null}
              </dl>
            </section>
          </div>
        </div>

        {hasWorkflowFooter ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Actions</p>
            <div className="flex flex-wrap gap-1.5">
              {canEdit && onEdit ? (
                <button
                  type="button"
                  disabled={!wsCanMutate}
                  onClick={() => onEdit(po)}
                  className={`${poActionBtn} border border-slate-200 bg-white text-[#134e4a] hover:bg-slate-50`}
                >
                  Edit PO
                </button>
              ) : null}
              {pending && onApprove && onReject ? (
                <>
                  <button
                    type="button"
                    disabled={!wsCanMutate}
                    onClick={() => onApprove(po)}
                    className={`${poActionBtn} bg-[#134e4a] text-white hover:brightness-110`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={!wsCanMutate}
                    onClick={() => onReject(po)}
                    className={`${poActionBtn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
                  >
                    Reject
                  </button>
                </>
              ) : null}
              {canTransport && onAssignTransport ? (
                <button
                  type="button"
                  disabled={!wsCanMutate}
                  onClick={() => onAssignTransport(po)}
                  className={`${poActionBtn} border border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100`}
                >
                  {po.status === 'On loading' ? 'Edit transport' : 'Assign transport'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {showPrint &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close print preview"
              className="no-print fixed inset-0 z-[11060] bg-black/50"
              onClick={() => setShowPrint(false)}
            />
            <div
              className="print-portal-scroll fixed inset-0 z-[11070] overflow-y-auto overscroll-y-contain p-4 sm:p-8"
              onClick={() => setShowPrint(false)}
            >
              <div className="mx-auto max-w-[210mm] pb-16" onClick={(e) => e.stopPropagation()}>
                <div className="quotation-print-root quotation-print-preview-mode rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
                  <PurchaseOrderPrintView po={po} printedAtIso={printStampIso} />
                </div>
                <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-[#134e4a] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg"
                  >
                    Print / Save as PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrint(false)}
                    className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </SlideOverPanel>
  );
}

/**
 * Accounts payable row detail (Procurement → Payments lists).
 */
export function ProcurementPayablePreviewSlideOver({
  payable: p,
  isOpen,
  onClose,
  branchNameById,
  todayIso,
  canPay,
  wsCanMutate,
  onPay,
}) {
  if (!p) return null;
  const paid = Number(p.paidNgn) || 0;
  const amt = Number(p.amountNgn) || 0;
  const outstanding = Math.max(0, amt - paid);
  const open = paid < amt;
  const pastDue =
    p.dueDateISO && String(p.dueDateISO).trim() && p.dueDateISO < todayIso && open;

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={p.apID ? `AP ${p.apID}` : 'Payable'}
      description="Supplier payable details"
      maxWidthClass="max-w-[min(96vw,440px)]"
    >
      <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-50">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Accounts payable</p>
            <h2 className="mt-0.5 font-mono text-lg font-bold text-[#134e4a]">{p.apID}</h2>
            <p className="text-xs font-medium text-slate-600">{p.supplierName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 text-[11px]">
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">PO reference</dt>
                <dd className="font-mono font-semibold text-slate-800">{p.poRef || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Invoice ref</dt>
                <dd className="font-semibold text-slate-800">{p.invoiceRef || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Due date</dt>
                <dd className="font-semibold text-slate-800">{p.dueDateISO || '—'}</dd>
              </div>
              {pastDue ? (
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Past due</p>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Branch</dt>
                <dd className="font-semibold text-slate-800">
                  {p.branchId ? branchNameById[p.branchId] || p.branchId : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Payment method</dt>
                <dd className="font-semibold text-slate-800">{p.paymentMethod || '—'}</dd>
              </div>
            </dl>
            <div className="border-t border-slate-100 pt-3 space-y-1 tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>Invoice amount</span>
                <span className="font-bold">{formatNgn(amt)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Paid</span>
                <span className="font-bold">{formatNgn(paid)}</span>
              </div>
              <div className="flex justify-between text-[#134e4a]">
                <span className="font-semibold">{open ? 'Outstanding' : 'Balance'}</span>
                <span className="text-base font-black">{formatNgn(open ? outstanding : 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {open && canPay ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              disabled={!wsCanMutate}
              onClick={() => onPay?.(p)}
              className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-sky-900 hover:bg-sky-100 disabled:opacity-40"
            >
              Record payment
            </button>
          </div>
        ) : null}
      </div>
    </SlideOverPanel>
  );
}
