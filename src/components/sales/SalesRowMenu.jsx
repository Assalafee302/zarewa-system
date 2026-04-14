import React from 'react';
import { MoreVertical, Eye, PencilLine, Receipt as ReceiptIcon, FileText } from 'lucide-react';

export function SalesRowMenu({
  rowKey,
  openKey,
  setOpenKey,
  onView,
  onEdit,
  editDisabled,
  editTitle,
  onAddReceipt,
  onReviewAudit,
}) {
  const open = openKey === rowKey;
  return (
    <div className="relative shrink-0" data-sales-action-menu>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenKey(open ? null : rowKey)}
        className="text-slate-400 hover:text-[#134e4a] p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/20"
      >
        <MoreVertical size={18} strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              onView();
              setOpenKey(null);
            }}
          >
            <Eye size={14} className="text-slate-400 shrink-0" />
            View
          </button>
          {onAddReceipt && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              onClick={() => {
                onAddReceipt();
                setOpenKey(null);
              }}
            >
              <ReceiptIcon size={14} className="text-emerald-400 shrink-0" />
              Add Receipt
            </button>
          )}
          {onReviewAudit && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#134e4a] hover:bg-slate-50"
              onClick={() => {
                onReviewAudit();
                setOpenKey(null);
              }}
            >
              <FileText size={14} className="text-slate-400 shrink-0" />
              Review Audit
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={editDisabled}
            title={editDisabled ? editTitle : undefined}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            onClick={() => {
              if (!editDisabled) {
                onEdit();
                setOpenKey(null);
              }
            }}
          >
            <PencilLine size={14} className="text-slate-400 shrink-0" />
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

