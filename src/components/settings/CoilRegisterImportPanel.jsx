import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { downloadCoilImportTemplate, parseCoilImportWorkbookArrayBuffer } from '../../lib/coilExcelImport';
import { apiFetch } from '../../lib/apiBase';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';

/**
 * Bulk coil register upload (Excel). Lives under Settings → Data & catalog;
 * results sync to workspace coil lots (see Store & production → Stock management).
 */
export default function CoilRegisterImportPanel() {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [coilImportBusy, setCoilImportBusy] = useState(false);
  const coilImportInputRef = useRef(null);

  const canImportCoilRegister = Boolean(
    ws?.hasPermission?.('purchase_orders.manage') ||
      ws?.hasPermission?.('inventory.receive') ||
      ws?.hasPermission?.('operations.manage') ||
      ws?.hasPermission?.('production.manage')
  );

  const handleCoilImportFileChange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!ws?.canMutate) {
      showToast('Reconnect to import coils — read-only workspace.', { variant: 'info' });
      return;
    }
    setCoilImportBusy(true);
    try {
      const ab = await f.arrayBuffer();
      const { rows, fileErrors } = parseCoilImportWorkbookArrayBuffer(ab);
      if (fileErrors.length) {
        showToast(fileErrors.slice(0, 4).join(' · '), { variant: 'error' });
        return;
      }
      if (!rows.length) {
        showToast('No valid coil rows (need Material + Kg, or Coil no + Product ID + Kg).', { variant: 'error' });
        return;
      }
      const r = await apiFetch('/api/coil-lots/import', {
        method: 'POST',
        body: JSON.stringify({ rows, insertOnly: false }),
      });
      const data = r.data;
      if (!r.ok || !data?.ok) {
        if (data?.code === 'CSRF_INVALID' || (r.status === 403 && String(data?.error || '').includes('CSRF'))) {
          showToast('Sign out and sign in again, then retry the upload (session security token).', {
            variant: 'error',
          });
          return;
        }
        if (r.status === 403 && data?.code === 'FORBIDDEN') {
          showToast(
            'Your role cannot import the coil register — need store receive, operations, production, or PO manage permission.',
            { variant: 'error' }
          );
          return;
        }
        const err = data?.error || `Import failed (${r.status})`;
        const rowErrs = data?.errors;
        if (Array.isArray(rowErrs) && rowErrs.length) {
          showToast(`${err} · Row ${rowErrs[0].row}: ${rowErrs[0].error}`, { variant: 'error' });
        } else {
          showToast(err, { variant: 'error' });
        }
        return;
      }
      const msg = `Imported ${data.imported} coil row(s).`;
      const skip = data.skipped?.length ? ` Skipped ${data.skipped.length}.` : '';
      const rowWarn = data.errors?.length ? ` ${data.errors.length} row(s) had validation issues.` : '';
      showToast(msg + skip + rowWarn);
      await ws.refresh?.();
    } catch (err) {
      showToast(String(err?.message || err), { variant: 'error' });
    } finally {
      setCoilImportBusy(false);
    }
  };

  if (!canImportCoilRegister) return null;

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]">
      <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-1 flex items-center gap-1.5">
        <FileSpreadsheet size={12} strokeWidth={2.25} className="text-[#134e4a]" aria-hidden />
        Coil register (Excel)
      </h3>
      <p className="text-[10px] text-slate-500 leading-snug mb-3 max-w-2xl">
        Upload or download the template to bulk upsert coil rows. Updated coils appear under{' '}
        <Link
          to="/operations"
          className="font-semibold text-[#134e4a] underline-offset-2 hover:underline"
        >
          Store & production
        </Link>{' '}
        → Stock management → Received coils.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={coilImportInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleCoilImportFileChange}
        />
        <button
          type="button"
          disabled={!ws?.canMutate || coilImportBusy}
          onClick={() => coilImportInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase text-[#134e4a] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileSpreadsheet size={14} aria-hidden />
          {coilImportBusy ? 'Importing…' : 'Upload coil register'}
        </button>
        <button
          type="button"
          onClick={() => downloadCoilImportTemplate()}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase text-slate-600 hover:bg-slate-100"
        >
          Excel template
        </button>
        <details className="relative ml-auto shrink-0">
          <summary
            className="list-none cursor-pointer rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#134e4a]/25 [&::-webkit-details-marker]:hidden"
            aria-label="Coil register Excel import format"
          >
            <Info className="size-3.5" strokeWidth={2.25} aria-hidden />
          </summary>
          <div
            role="note"
            className="absolute right-0 top-full z-30 mt-1.5 w-[min(calc(100vw-2rem),22rem)] rounded-lg border border-slate-200 bg-white p-2.5 text-[9px] leading-snug text-slate-700 shadow-lg ring-1 ring-black/5"
          >
            <p className="font-semibold text-slate-800 mb-1">Simple format (recommended)</p>
            <p>
              Row 1: <span className="font-mono">Material</span>, <span className="font-mono">Kg</span>,{' '}
              <span className="font-mono">Colour</span>, <span className="font-mono">Gauge</span>, optional{' '}
              <span className="font-mono">Coil no</span>. Material maps to stock (e.g. Aluminium → COIL-ALU, Aluzinc /
              PPGI → PRD-102). Omit supplier — it can stay blank for yard stock. If coil no is empty, the app builds a
              stable tag from row + colour + gauge so re-upload updates the same line.
            </p>
            <p className="mt-2 pt-2 border-t border-slate-100 text-slate-600">
              Legacy: <span className="font-mono">Coil no</span> + <span className="font-mono">Product ID</span> +{' '}
              <span className="font-mono">Current kg</span>, or unlabeled columns auto-detected (tags + COIL-… / PRD-…
              + kg).
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
