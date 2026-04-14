import React from 'react';
import { Printer, X } from 'lucide-react';
import { ModalFrame } from '../layout';
import { StandardReportPrintShell } from './StandardReportPrintShell';

const TH = 'px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-slate-600 print:text-[8pt]';
const TD = 'px-2 py-1.5 align-top text-[11px] text-slate-800 print:text-[10pt]';

/**
 * A4 management report — use inside a wrapper with `quotation-print-root quotation-print-preview-mode` for @media print.
 */
export function ManagementReportSheet({
  title,
  periodLabel,
  columns,
  rows,
  summaryLines = [],
  documentTypeLabel = 'Management report',
}) {
  const generated = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <StandardReportPrintShell
      documentTypeLabel={documentTypeLabel}
      title={title}
      subtitle={periodLabel}
      watermarkText="RPT"
      rightColumn={
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 print:text-[9pt]">Generated</p>
          <p className="mt-0.5 font-medium text-slate-900">{generated}</p>
        </>
      }
      footer="Confidential — internal operations summary. Figures reflect workspace snapshot at generation time."
    >
      <table className="quotation-print-table w-full border-collapse border border-slate-200">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/90">
            {columns.map((c) => (
              <th key={c.key} className={`${TH} ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={Math.max(1, columns.length)}
                className="border-b border-slate-100 px-2 py-4 text-center text-slate-500 italic print:text-[9pt]"
              >
                No rows in this period.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="quotation-print-line border-b border-slate-100">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${TD} ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${
                      i % 2 === 1 ? 'bg-slate-50/50' : ''
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
        <ul className="mt-6 space-y-2 border-t border-slate-200 pt-4 text-[10px] text-slate-700 print:text-[9pt]">
          {summaryLines.map((line, idx) => (
            <li key={idx} className="flex justify-between gap-4 font-semibold">
              <span className="text-slate-600">{line.label}</span>
              <span className="shrink-0 tabular-nums text-slate-900">{line.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </StandardReportPrintShell>
  );
}

export function ReportPrintModal({
  isOpen,
  onClose,
  title,
  periodLabel,
  columns,
  rows,
  summaryLines,
  documentTypeLabel,
}) {
  return (
    <ModalFrame isOpen={isOpen} onClose={onClose}>
      <div className="z-modal-panel-lg max-h-[92vh] flex flex-col p-0 overflow-hidden">
        <div className="no-print flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 shrink-0 bg-white">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Print preview</p>
            <p className="text-sm font-bold text-[#134e4a] truncate">{title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => window.print()} className="z-btn-primary py-2.5 px-4">
              <Printer size={16} />
              Print
            </button>
            <button type="button" onClick={onClose} className="z-btn-secondary py-2.5 px-3" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-100/80 p-4 sm:p-6">
          <div className="quotation-print-root quotation-print-preview-mode mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden print:shadow-none print:rounded-none print:border-0">
            <ManagementReportSheet
              title={title}
              periodLabel={periodLabel}
              columns={columns}
              rows={rows}
              summaryLines={summaryLines}
              documentTypeLabel={documentTypeLabel}
            />
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
