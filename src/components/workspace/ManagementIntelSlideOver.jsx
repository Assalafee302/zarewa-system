import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { SlideOverPanel } from '../layout/SlideOverPanel';
import { ThreadDrawerTransactionIntel } from '../office/ThreadDrawerTransactionIntel';

/**
 * Slide-over for workspace inbox management rows — light shell aligned with Office/workspace.
 */
export function ManagementIntelSlideOver({ workItem, isOpen, onDismiss }) {
  const title = String(workItem?.title || 'Details').trim() || 'Details';

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={() => onDismiss?.()}
      title={title}
      description="Quotation and ledger context"
      maxWidthClass="max-w-[min(96vw,560px)]"
    >
      <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-50">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
            <h2 className="mt-0.5 text-base font-semibold leading-snug text-slate-900 line-clamp-2">{title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/manager"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Manager
            </Link>
            <button
              type="button"
              onClick={() => onDismiss?.()}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workItem ? (
            <ThreadDrawerTransactionIntel
              workItem={workItem}
              variant="standalone"
              onManagementDecisionSuccess={() => onDismiss?.()}
            />
          ) : null}
        </div>
      </div>
    </SlideOverPanel>
  );
}
