import React from 'react';
import { Printer, X } from 'lucide-react';
import { ModalFrame } from '../layout';

const ACCENT = '#134e4a';

/**
 * A4 management report body — used inside ModalFrame; class `report-print-root` enables @media print.
 */
export function ManagementReportSheet({ title, periodLabel, columns, rows, summaryLines = [] }) {
  const generated = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="report-print-a4 bg-white text-slate-900 p-6 sm:p-8 text-[11px] leading-snug">
      <header
        className="border-b-2 pb-4 mb-5 flex flex-wrap items-start gap-4"
        style={{ borderColor: ACCENT }}
      >
        <img
          src={ZAREWA_LOGO_SRC}
          alt=""
          className="h-12 w-12 shrink-0 object-contain print:h-11 print:w-11"
          width={48}
          height={48}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
            Zarewa System
          </p>
          <h1 className="text-xl font-black text-slate-900 mt-2 tracking-tight">{title}</h1>
          <p className="text-[11px] text-slate-600 mt-1 font-medium">{periodLabel}</p>
          <p className="text-[10px] text-slate-400 mt-3">Generated {generated}</p>
        </div>
      </header>

      <table className="report-print-table w-full border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="border border-slate-300 px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wide text-white print:text-[8px]"
                style={{ backgroundColor: ACCENT }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="report-print-tr">
              <td
                colSpan={Math.max(1, columns.length)}
                className="border border-slate-200 px-2 py-4 text-center text-slate-500 italic"
              >
                No rows in this period.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="report-print-tr">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`border border-slate-200 px-2 py-1.5 align-top print:text-[8px] ${
                      i % 2 === 1 ? 'bg-slate-50/90' : 'bg-white'
                    }`}
                  >
                    {row[c.key] != null && row[c.key] !== '' ? String(row[c.key]) : '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {summaryLines.length > 0 ? (
        <ul className="mt-6 space-y-2 text-[10px] text-slate-700 border-t border-slate-200 pt-4">
          {summaryLines.map((line, idx) => (
            <li key={idx} className="flex justify-between gap-4 font-semibold">
              <span className="text-slate-600">{line.label}</span>
              <span className="tabular-nums text-slate-900 shrink-0">{line.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="mt-10 pt-4 border-t border-slate-200 text-[9px] text-slate-400 leading-relaxed">
        Confidential — internal operations summary. Figures reflect workspace snapshot at generation time.
      </footer>
    </div>
  );
}

export function ReportPrintModal({ isOpen, onClose, title, periodLabel, columns, rows, summaryLines }) {
  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <div className="z-modal-panel-lg max-h-[92vh] flex flex-col p-0 overflow-hidden">
        <div className="no-print flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 shrink-0 bg-white">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Print preview</p>
            <p className="text-sm font-bold text-[#134e4a] truncate">{title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="z-btn-primary py-2.5 px-4"
            >
              <Printer size={16} />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="z-btn-secondary py-2.5 px-3"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-100/80 p-4 sm:p-6">
          <div className="report-print-root quotation-print-a4 mx-auto bg-white shadow-xl rounded-lg border border-slate-200 overflow-hidden print:shadow-none print:rounded-none print:border-0">
            <ManagementReportSheet
              title={title}
              periodLabel={periodLabel}
              columns={columns}
              rows={rows}
              summaryLines={summaryLines}
            />
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
