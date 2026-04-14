import React, { useMemo, useState } from 'react';
import { Printer, CalendarRange } from 'lucide-react';
import { ReportPrintModal } from '../reports/ReportPrintModal';
import { formatNgn } from '../../Data/mockData';
import { purchaseOrderOrderedValueNgn } from '../../lib/liveAnalytics';
import {
  buildSupplierStatementPrintPayload,
  buildTransportStatementPrintPayload,
  defaultStatementRangeIso,
} from '../../lib/procurementCounterpartyStatement';

/**
 * Period statement print (supplier PO ledger lines or transporter haulage lines).
 */
export function ProcurementStatementPrintBlock({ kind, entityLabel, supplierId, agentId, purchaseOrders }) {
  const def = useMemo(() => defaultStatementRangeIso(), []);
  const [from, setFrom] = useState(def.startIso);
  const [to, setTo] = useState(def.endIso);
  const [printOpen, setPrintOpen] = useState(false);

  const payload = useMemo(() => {
    let a = String(from || '').slice(0, 10);
    let b = String(to || '').slice(0, 10);
    if (a && b && a > b) {
      const t = a;
      a = b;
      b = t;
    }
    if (kind === 'supplier') {
      return buildSupplierStatementPrintPayload({
        purchaseOrders,
        supplierId,
        startIso: a,
        endIso: b,
        formatNgn,
        purchaseOrderOrderedValueNgn,
      });
    }
    return buildTransportStatementPrintPayload({
      purchaseOrders,
      agentId,
      startIso: a,
      endIso: b,
      formatNgn,
    });
  }, [kind, from, to, purchaseOrders, supplierId, agentId]);

  const modalTitle = `${payload.title} — ${entityLabel}`;

  return (
    <>
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <CalendarRange size={16} className="text-[#134e4a] shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Statement for period</p>
        </div>
        <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
          Choose dates (PO order date). Opens a printable A4 sheet — same layout as management reports.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#134e4a] text-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide shadow-sm hover:brightness-105"
          >
            <Printer size={16} />
            Print statement
          </button>
        </div>
      </div>

      <ReportPrintModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        title={modalTitle}
        periodLabel={payload.periodLabel}
        columns={payload.columns}
        rows={payload.rows}
        summaryLines={payload.summaryLines}
        documentTypeLabel="Procurement statement"
      />
    </>
  );
}
