import { ZAREWA_QUOTATION_BRANDING } from '../Data/companyQuotation';
import { formatNgn } from '../Data/mockData';
import { receiptCashReceivedNgn, receiptLedgerReceiptTreasurySplits } from '../lib/salesReceiptsList';
import { CUTTING_LIST_A4_LANDSCAPE_ROWS_PER_PAGE } from './cuttingListReportConstants';

export {
  CUTTING_LIST_A4_LANDSCAPE_ROWS_PER_PAGE,
  CUTTING_LIST_REPORT_ROWS_PER_PAGE,
} from './cuttingListReportConstants';

const LINE_CATEGORIES = [
  { type: 'Roof', title: 'Roofing sheet' },
  { type: 'Flatsheet', title: 'Flat sheet' },
  { type: 'Cladding', title: 'Cladding' },
];

/** Printed cutting tables and waybill material check: roofing + cladding only (flat sheet omitted). */
const PRINT_CUT_LINE_CATEGORIES = [
  { type: 'Roof', title: 'Roofing sheet' },
  { type: 'Cladding', title: 'Cladding' },
];

function parseNum(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₦0.00';
  return `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineValueNgn(row) {
  return parseNum(row.qty) * parseNum(row.unitPrice);
}

function sumLineRows(rows) {
  return (rows ?? []).reduce((s, r) => s + lineValueNgn(r), 0);
}

/** Hide quotation lines with no usable label or commercial qty/value (print only). */
function billingRowsWithContent(rows) {
  return (rows ?? []).filter((r) => {
    const name = String(r?.name ?? '').trim();
    if (!name) return false;
    const q = parseNum(r.qty);
    const v = lineValueNgn(r);
    return q > 0 || v > 0;
  });
}

function flattenCuttingLinesByCategories(linesByCat, categories) {
  const out = [];
  for (const { type } of categories) {
    const bucket = linesByCat?.[type] ?? [];
    for (const line of bucket) {
      const sheets = parseNum(line.sheets);
      const lengthM = parseNum(line.lengthM);
      if (sheets > 0 && lengthM > 0) {
        out.push({ type, sheets, lengthM, id: line.id });
      }
    }
  }
  return out;
}

function chunkLines(lines, size) {
  if (lines.length === 0) return [[]];
  const chunks = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size));
  }
  return chunks;
}

function groupByType(lines) {
  const m = { Roof: [], Flatsheet: [], Cladding: [] };
  for (const line of lines) {
    if (m[line.type]) m[line.type].push(line);
  }
  return m;
}

/** Same length (m) within the same sheet category → one row with summed qty; then longest first. */
function mergeCuttingLinesByLengthDesc(flatLines, categories = LINE_CATEGORIES) {
  const byType = groupByType(flatLines);
  const out = [];
  for (const { type } of categories) {
    const bucket = byType[type] ?? [];
    if (!bucket.length) continue;
    const byLen = new Map();
    for (const line of bucket) {
      const len = parseNum(line.lengthM);
      if (!(len > 0)) continue;
      const key = len;
      const prev = byLen.get(key);
      if (prev) {
        prev.sheets += parseNum(line.sheets);
      } else {
        byLen.set(key, {
          type,
          sheets: parseNum(line.sheets),
          lengthM: len,
          id: `agg-${type}-${key}`,
        });
      }
    }
    const merged = Array.from(byLen.values()).sort((a, b) => b.lengthM - a.lengthM);
    out.push(...merged);
  }
  return out;
}

function BillingTable({ title, rows }) {
  if (!rows?.length) return null;
  const sub = sumLineRows(rows);
  return (
    <div className="cl-factory-bill-block">
      <div className="cl-factory-bill-title-bar">
        <span className="cl-factory-bill-title-dot" aria-hidden />
        <p className="cl-factory-bill-title">{title}</p>
      </div>
      <div className="cl-factory-table-shell">
        <table className="cl-factory-bill-table w-full border-collapse">
          <thead>
            <tr>
              <th className="cl-factory-bill-th text-left">Item</th>
              <th className="cl-factory-bill-th text-right">Qty</th>
              <th className="cl-factory-bill-th text-right">Unit</th>
              <th className="cl-factory-bill-th text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id ?? `${title}-${row.name}-${ri}`}>
                <td className="cl-factory-bill-td">{row.name}</td>
                <td className="cl-factory-bill-td text-right tabular-nums">{row.qty}</td>
                <td className="cl-factory-bill-td text-right tabular-nums">{formatMoney(parseNum(row.unitPrice))}</td>
                <td className="cl-factory-bill-td text-right tabular-nums cl-factory-bill-td-amount">{formatMoney(lineValueNgn(row))}</td>
              </tr>
            ))}
            <tr className="cl-factory-bill-subtotal-row">
              <td colSpan={3} className="cl-factory-bill-td cl-factory-bill-subtotal-label">
                Sub total
              </td>
              <td className="cl-factory-bill-td text-right tabular-nums cl-factory-bill-subtotal-value">{formatMoney(sub)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FactoryRefLine({ cuttingListId, cutDate, quotationRef, ariaLabel = 'References' }) {
  return (
    <div className="cl-factory-banner-refline" aria-label={ariaLabel}>
      <span className="cl-factory-ref-group">
        <span className="cl-factory-ref-k">List</span>
        <span className="cl-factory-ref-v cl-factory-ref-v--id font-mono">{cuttingListId}</span>
      </span>
      <span className="cl-factory-ref-sep">·</span>
      <span className="cl-factory-ref-group">
        <span className="cl-factory-ref-k">Date</span>
        <span className="cl-factory-ref-v">{cutDate}</span>
      </span>
      <span className="cl-factory-ref-sep">·</span>
      <span className="cl-factory-ref-group">
        <span className="cl-factory-ref-k">Quotation</span>
        <span className="cl-factory-ref-v cl-factory-ref-v--id font-mono">{quotationRef || '—'}</span>
      </span>
    </div>
  );
}

function WaybillBranchesBlock({ branches, compact }) {
  const list = branches ?? [];
  if (!list.length) return null;
  return (
    <div className={compact ? 'cl-waybill-branches-block--compact' : 'cl-waybill-section cl-waybill-section--branches'}>
      {!compact ? <p className="cl-waybill-section-title">Zarewa branches</p> : null}
      <div className={compact ? 'cl-waybill-branches-stack cl-waybill-branches-stack--compact-row' : 'cl-waybill-branches-stack'}>
        {list.map((br) => (
          <div key={br.title} className="cl-waybill-branch-card">
            <p className="cl-waybill-branch-heading">{br.title}</p>
            {br.lines.map((ln, i) => (
              <p key={i} className="cl-waybill-branch-line">
                {ln}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WaybillCutConfirmBlock({ grouped, cutStartIndex, fullRightColumn }) {
  const anyLines = PRINT_CUT_LINE_CATEGORIES.some(({ type }) => (grouped[type] ?? []).length > 0);
  const { blocks } = PRINT_CUT_LINE_CATEGORIES.reduce(
    (acc, { type, title }) => {
      const slice = grouped[type];
      if (!slice?.length) return acc;
      const block = <CuttingCategoryTable title={title} lines={slice} startIndex={acc.idx} />;
      acc.blocks.push(<div key={type}>{block}</div>);
      acc.idx += slice.length;
      return acc;
    },
    { idx: cutStartIndex, blocks: [] }
  );
  return (
    <div
      className={
        fullRightColumn
          ? 'cl-waybill-section cl-waybill-section--cut-confirm cl-waybill-section--cuts-full-column'
          : 'cl-waybill-section cl-waybill-section--cut-confirm'
      }
    >
      <div className="cl-waybill-cut-tables cl-factory-panel--cut-list">
        {blocks}
        {!anyLines ? <p className="cl-factory-cut-empty">No cutting lines on this section.</p> : null}
      </div>
    </div>
  );
}

function WaybillPanel({
  b,
  cuttingListId,
  quotationRef,
  cutDate,
  selectedQuotation,
  materialInfoValue,
  sheetsToCut,
  totalMeters,
  continuation,
  chunkIndex,
  totalChunks,
  grouped,
  cutStartIndex,
}) {
  const customer = selectedQuotation?.customer ?? '—';
  const project = selectedQuotation?.projectName ?? '—';
  const shipAddr = String(selectedQuotation?.addressShipping ?? selectedQuotation?.deliveryAddress ?? '').trim();
  const metersLabel = typeof totalMeters === 'number' ? totalMeters.toLocaleString() : String(totalMeters ?? '—');
  const sheetsLabel = typeof sheetsToCut === 'number' ? sheetsToCut.toLocaleString() : String(sheetsToCut ?? '—');

  return (
    <div className="cl-waybill-root">
      <header className="cl-factory-banner cl-factory-banner--waybill-pane cl-waybill-banner--top">
        <div className="cl-factory-banner-accent" aria-hidden />
        <div className="cl-factory-banner-inner cl-factory-banner-inner--balanced">
          <div className="cl-factory-banner-side">
            <div className="cl-factory-logo-ring">
              <img src={b.logoSrc} alt="" className="cl-factory-logo-img" />
            </div>
          </div>
          <div className="cl-factory-banner-titles cl-factory-banner-titles--center">
            <p className="cl-factory-legal-name">{b.legalName}</p>
            <h1 className="cl-factory-doc-title">Waybill</h1>
          </div>
          <div className="cl-factory-banner-side cl-factory-banner-side--spacer" aria-hidden />
        </div>
        {continuation ? (
          <p className="cl-waybill-continuation-strip">
            Continuation {chunkIndex + 1}/{totalChunks} — attach to sheet 1. Commercial summary is on the first page only.
          </p>
        ) : null}
      </header>

      <div className="cl-waybill-body cl-factory-panel cl-factory-panel--waybill">
        <div className="cl-waybill-mid-split" aria-label="Waybill left column and material check">
          <div className="cl-waybill-col cl-waybill-col--addresses">
            <div className="cl-waybill-branches-in-left">
              <WaybillBranchesBlock branches={b.branches} compact />
            </div>

            <div className="cl-waybill-section cl-waybill-section--delivery-left">
              <p className="cl-waybill-section-title">Delivery address</p>
              {shipAddr ? <p className="cl-waybill-address-text">{shipAddr}</p> : null}
              <div className="cl-factory-write-line" />
              <div className="cl-factory-write-line cl-waybill-write-gap" />
            </div>

            <div className="cl-waybill-section">
              <p className="cl-waybill-section-title">Cargo summary</p>
              <dl className="cl-waybill-dl">
                <dt>Cutting list</dt>
                <dd className="font-mono font-semibold">{cuttingListId}</dd>
                <dt>Date</dt>
                <dd>{cutDate}</dd>
                <dt>Quotation</dt>
                <dd className="font-mono font-semibold">{quotationRef || '—'}</dd>
                <dt>Customer</dt>
                <dd>{customer}</dd>
                <dt>Project</dt>
                <dd>{project}</dd>
                <dt>Material</dt>
                <dd>{materialInfoValue}</dd>
                <dt>Sheets (roof + cladding)</dt>
                <dd className="tabular-nums">{sheetsLabel}</dd>
                <dt>Linear metres</dt>
                <dd className="tabular-nums">{metersLabel} m</dd>
              </dl>
            </div>

            <div className="cl-waybill-section">
              <p className="cl-waybill-section-title">Transport</p>
              <div className="cl-waybill-labeled-lines">
                <div>
                  <span className="cl-factory-field-label">Vehicle reg.</span>
                  <div className="cl-factory-write-line" />
                </div>
                <div>
                  <span className="cl-factory-field-label">Driver / phone</span>
                  <div className="cl-factory-write-line" />
                </div>
              </div>
            </div>

            <div className="cl-waybill-section cl-waybill-section--signoff">
              <p className="cl-waybill-section-title">Received at site</p>
              <div className="cl-waybill-labeled-lines">
                <div>
                  <span className="cl-factory-field-label">Received by (print)</span>
                  <div className="cl-factory-write-line" />
                </div>
                <div className="cl-waybill-sign-row">
                  <div className="cl-waybill-sign-cell">
                    <div className="cl-factory-sign-line cl-factory-sign-line--waybill" />
                    <p className="cl-factory-sign-label">Signature</p>
                  </div>
                  <div className="cl-waybill-sign-cell cl-waybill-sign-cell--date">
                    <div className="cl-factory-sign-line cl-factory-sign-line--waybill" />
                    <p className="cl-factory-sign-label">Date / time</p>
                  </div>
                </div>
                <div>
                  <span className="cl-factory-field-label">Remarks</span>
                  <div className="cl-factory-write-line" />
                  <div className="cl-factory-write-line cl-waybill-write-gap" />
                </div>
              </div>
            </div>
          </div>

          <div className="cl-waybill-col cl-waybill-col--cuts">
            <WaybillCutConfirmBlock grouped={grouped} cutStartIndex={cutStartIndex} fullRightColumn />
          </div>
        </div>
      </div>
    </div>
  );
}

function CuttingCategoryTable({ title, lines, startIndex }) {
  if (!lines?.length) return null;
  const catM = lines.reduce((s, line) => s + line.sheets * line.lengthM, 0);
  return (
    <div className="cl-factory-cut-block">
      <div className="cl-factory-cut-title-bar">
        <span className="cl-factory-cut-title-icon" aria-hidden />
        <p className="cl-factory-cut-title">{title}</p>
      </div>
      <div className="cl-factory-table-shell cl-factory-table-shell--cut">
        <table className="cl-factory-cut-table w-full border-collapse">
        <thead>
          <tr>
            <th className="cl-factory-cut-th text-right w-[28%]">Length (m)</th>
            <th className="cl-factory-cut-th text-right w-[22%]">Qty</th>
            <th className="cl-factory-cut-th text-right w-[50%]">Total m</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const lineM = line.sheets * line.lengthM;
            return (
              <tr key={line.id ?? `r-${title}-${line.lengthM}-${startIndex + i}`}>
                <td className="cl-factory-cut-td text-right tabular-nums">{line.lengthM}</td>
                <td className="cl-factory-cut-td text-right tabular-nums">{line.sheets}</td>
                <td className="cl-factory-cut-td text-right tabular-nums">{lineM.toLocaleString('en-NG', { maximumFractionDigits: 2 })}</td>
              </tr>
            );
          })}
          <tr className="cl-factory-cut-total-row">
            <td colSpan={2} className="cl-factory-cut-td text-right font-bold">
              Total sum (m)
            </td>
            <td className="cl-factory-cut-td text-right font-bold tabular-nums">
              {catM.toLocaleString('en-NG', { maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ProductionScratchpad() {
  return (
    <div className="cl-factory-scratch">
      <p className="cl-factory-scratch-title">
        <span className="cl-factory-scratch-title-mark" aria-hidden />
        Production record <span className="cl-factory-scratch-sub">manual · coil / conversion</span>
      </p>
      <div className="cl-factory-scratch-grid text-[5.75pt] gap-y-0.5">
        <div>
          <span className="cl-factory-field-label">Production ID</span>
          <div className="cl-factory-write-line" />
        </div>
        <div className="cl-factory-scratch-row3">
          <span className="cl-factory-field-label">Coil no.</span>
          <span className="cl-factory-field-label text-center">Before (m / kg)</span>
          <span className="cl-factory-field-label text-center">After (m / kg)</span>
          <div className="cl-factory-write-line" />
          <div className="cl-factory-write-line" />
          <div className="cl-factory-write-line" />
        </div>
        <div className="cl-factory-scratch-row3">
          <div>
            <span className="cl-factory-field-label">KG</span>
            <div className="cl-factory-write-line" />
          </div>
          <div>
            <span className="cl-factory-field-label">Off cut</span>
            <div className="cl-factory-write-line" />
          </div>
          <div>
            <span className="cl-factory-field-label">Conversion</span>
            <div className="cl-factory-write-line" />
          </div>
        </div>
        <div>
          <span className="cl-factory-field-label">Metres produced</span>
          <div className="cl-factory-write-line" />
        </div>
        <div>
          <span className="cl-factory-field-label">Date &amp; time</span>
          <div className="cl-factory-write-line" />
        </div>
        <div className="grid grid-cols-2 gap-1 mt-0">
          <div>
            <span className="cl-factory-field-label">Operator</span>
            <div className="cl-factory-write-line" />
          </div>
          <div>
            <span className="cl-factory-field-label">Store keeper</span>
            <div className="cl-factory-write-line" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptPaymentBlock({ receipt, treasuryMovements }) {
  const splits = receiptLedgerReceiptTreasurySplits(receipt, treasuryMovements);
  const total = receiptCashReceivedNgn(receipt);
  return (
    <div className="cl-factory-receipt-block">
      <div className="cl-factory-receipt-row">
        <span className="cl-factory-receipt-id font-mono">{receipt.id}</span>
        <span className="cl-factory-receipt-sep">·</span>
        <span className="cl-factory-receipt-date">{receipt.date ?? receipt.dateISO}</span>
        <span className="cl-factory-receipt-sep">·</span>
        <span className="cl-factory-receipt-amt tabular-nums">{formatNgn(total)}</span>
        <span className="cl-factory-receipt-sep">·</span>
        <span className="cl-factory-receipt-bank">{receipt.bankReference || receipt.method || receipt.paymentMethod || '—'}</span>
      </div>
      {splits.length > 0 ? (
        <ul className="cl-factory-receipt-splits">
          {splits.map((s) => (
            <li key={s.movementId} className="cl-factory-receipt-split-line">
              <span>{s.accountLabel}</span>
              <span className="tabular-nums">{formatNgn(s.amountNgn)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cl-factory-receipt-split-fallback tabular-nums">Treasury breakdown not on file — total {formatNgn(total)}</p>
      )}
    </div>
  );
}

/**
 * Factory cutting list — A4 landscape: left half = cutting + commercial pack; right half = matching waybill.
 */
export default function CuttingListReportPrintView({
  cuttingListId,
  quotationRef,
  selectedQuotation,
  materialSpec,
  materialTypeLabel = '',
  dateISO,
  machineName,
  operatorName = '',
  linesByCat,
  receiptsForQuotation = [],
  productionFooterName = '',
  treasuryMovements = [],
}) {
  const b = ZAREWA_QUOTATION_BRANDING;
  const rowsPerPage = CUTTING_LIST_A4_LANDSCAPE_ROWS_PER_PAGE;
  const flatLines = mergeCuttingLinesByLengthDesc(
    flattenCuttingLinesByCategories(linesByCat, PRINT_CUT_LINE_CATEGORIES),
    PRINT_CUT_LINE_CATEGORIES
  );
  const chunks = chunkLines(flatLines, rowsPerPage);
  const totalChunks = chunks.length;
  const printSheetsRoofClad = flatLines.reduce((s, l) => s + l.sheets, 0);
  const printMetresRoofClad = flatLines.reduce((s, l) => s + l.sheets * l.lengthM, 0);

  const ql = selectedQuotation?.quotationLines;
  const products = ql?.products ?? [];
  const accessories = billingRowsWithContent(ql?.accessories ?? []);
  const services = billingRowsWithContent(ql?.services ?? []);
  const subProd = sumLineRows(products);
  const subAcc = sumLineRows(accessories);
  const subServ = sumLineRows(services);
  const grand = subProd + subAcc + subServ;

  const materialLine = [
    materialSpec?.profile || selectedQuotation?.materialDesign,
    materialSpec?.colour || selectedQuotation?.materialColor,
    materialSpec?.gauge || selectedQuotation?.materialGauge,
  ]
    .filter(Boolean)
    .join(', ');

  const typeFromMaster = String(materialTypeLabel ?? '').trim();
  const materialInfoValue = [typeFromMaster, materialLine].filter(Boolean).join(' · ') || '—';

  const cutDate = dateISO || selectedQuotation?.dateISO || '—';

  const waybillShared = {
    b,
    cuttingListId,
    quotationRef,
    cutDate,
    selectedQuotation,
    materialInfoValue,
    sheetsToCut: printSheetsRoofClad,
    totalMeters: printMetresRoofClad,
    totalChunks,
  };

  return (
    <div
      className="cutting-list-a4-landscape-report-root cutting-list-factory-root cl-factory-theme bg-white text-slate-900 antialiased"
      data-print-profile="cutting-list-a4-landscape"
      data-print-paper="A4"
      data-print-orientation="landscape"
      data-print-sections={String(totalChunks)}
    >
      {chunks.map((chunk, chunkIndex) => {
        const grouped = groupByType(chunk);
        let idx = chunkIndex * rowsPerPage;

        return (
          <section
            key={chunkIndex}
            className={`cutting-list-a4-landscape-sheet ${chunkIndex > 0 ? 'cutting-list-a4-landscape-sheet--continuation' : ''} ${chunkIndex < totalChunks - 1 ? 'cutting-list-a4-landscape-sheet--break-after' : ''}`}
          >
            <div className="cl-a4-landscape-split">
              <div className="cl-a4-pane cl-a4-pane--cutting">
                {chunkIndex === 0 ? (
                  <>
                    <header className="cl-factory-banner shrink-0">
                      <div className="cl-factory-banner-accent" aria-hidden />
                      <div className="cl-factory-banner-inner cl-factory-banner-inner--balanced">
                        <div className="cl-factory-banner-side">
                          <div className="cl-factory-logo-ring">
                            <img src={b.logoSrc} alt="" className="cl-factory-logo-img" />
                          </div>
                        </div>
                        <div className="cl-factory-banner-titles cl-factory-banner-titles--center">
                          <p className="cl-factory-legal-name">{b.legalName}</p>
                          <h1 className="cl-factory-doc-title">Cutting list</h1>
                        </div>
                        <div className="cl-factory-banner-side cl-factory-banner-side--spacer" aria-hidden />
                      </div>
                      <FactoryRefLine
                        cuttingListId={cuttingListId}
                        cutDate={cutDate}
                        quotationRef={quotationRef}
                        ariaLabel="Cutting list references"
                      />
                      <div className="cl-factory-subbar cl-factory-subbar--triple">
                        <span className="cl-factory-subbar-seg">
                          <span className="cl-factory-subbar-k">Project</span>
                          <span className="cl-factory-subbar-v">{selectedQuotation?.projectName ?? '—'}</span>
                        </span>
                        <span className="cl-factory-subbar-seg">
                          <span className="cl-factory-subbar-k">Material</span>
                          <span className="cl-factory-subbar-v">{materialInfoValue}</span>
                        </span>
                        <span className="cl-factory-subbar-seg">
                          <span className="cl-factory-subbar-k">Machine</span>
                          <span className="cl-factory-subbar-v">{machineName || '—'}</span>
                        </span>
                      </div>
                    </header>
                    <div className="cl-factory-prepared-by-top shrink-0" aria-label="Cutting list prepared by">
                      <span className="cl-factory-created-by-k">Cutting list prepared by</span>
                      <span className="cl-factory-created-by-v">{productionFooterName || '—'}</span>
                    </div>
                    <div className="cl-factory-body cl-factory-body--cut-first cl-factory-body--a4-landscape-left">
                      <div className="cl-factory-col-cut cl-factory-panel cl-factory-panel--accent cl-factory-panel--cut-list min-w-0">
                        {PRINT_CUT_LINE_CATEGORIES.map(({ type, title }) => {
                          const slice = grouped[type];
                          if (!slice.length) return null;
                          const block = <CuttingCategoryTable title={title} lines={slice} startIndex={idx} />;
                          idx += slice.length;
                          return <div key={type}>{block}</div>;
                        })}
                        {chunk.length === 0 ? (
                          <p className="cl-factory-cut-empty">No roofing / cladding lines with qty and length.</p>
                        ) : null}
                      </div>

                      <div className="cl-factory-col-commercial cl-factory-panel min-w-0">
                        <div className="cl-factory-commercial-filler">
                          <BillingTable title="Products" rows={products} />
                          <BillingTable title="Accessories" rows={accessories} />
                          <BillingTable title="Services" rows={services} />

                          <div className="cl-factory-table-shell cl-factory-grand-shell">
                            <table className="cl-factory-bill-table w-full border-collapse">
                              <tbody>
                                <tr className="cl-factory-bill-subtotal-row">
                                  <td colSpan={3} className="cl-factory-bill-td cl-factory-bill-subtotal-label">
                                    Grand total
                                  </td>
                                  <td className="cl-factory-bill-td text-right tabular-nums cl-factory-bill-subtotal-value">
                                    {formatMoney(grand)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="cl-factory-receipt-box">
                            <p className="cl-factory-receipt-head">Payment &amp; receipts</p>
                            {receiptsForQuotation.length === 0 ? (
                              <p className="cl-factory-receipt-empty">No receipts on file.</p>
                            ) : (
                              receiptsForQuotation.map((r) => (
                                <ReceiptPaymentBlock key={r.id} receipt={r} treasuryMovements={treasuryMovements} />
                              ))
                            )}
                          </div>

                          <div className="cl-factory-chips" aria-label="Production context">
                            {operatorName ? <span className="cl-factory-chip">{operatorName}</span> : null}
                            <span className="cl-factory-chip cl-factory-chip--accent">
                              {printSheetsRoofClad.toLocaleString()} sheets (roof + cladding) ·{' '}
                              {printMetresRoofClad.toLocaleString()} m
                            </span>
                          </div>
                        </div>

                        <div className="cl-factory-scratch-anchor">
                          <ProductionScratchpad />
                        </div>
                      </div>
                    </div>
                    <div
                      className="cl-factory-sheet-signfoot cl-factory-sheet-signfoot--a4-cutting-pane shrink-0"
                      aria-label="Signature"
                    >
                      <div className="cl-factory-sign-cell">
                        <div className="cl-factory-sign-line" />
                        <p className="cl-factory-sign-label">Signature</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="cl-factory-continue cl-factory-continue--a4-pane">
                    <p className="cl-factory-continue-bar">
                      <span className="cl-factory-continue-tag">Continuation</span>
                      <span className="cl-factory-continue-body">
                        {cuttingListId} · {quotationRef || '—'} · section {chunkIndex + 1} of {totalChunks} (lines {chunkIndex * rowsPerPage + 1}–
                        {chunkIndex * rowsPerPage + chunk.length})
                      </span>
                    </p>
                    <div className="cl-factory-col-right cl-factory-col-right--full cl-factory-panel cl-factory-panel--accent cl-factory-panel--cut-list min-w-0">
                      {PRINT_CUT_LINE_CATEGORIES.map(({ type, title }) => {
                        const slice = grouped[type];
                        if (!slice.length) return null;
                        const block = <CuttingCategoryTable title={title} lines={slice} startIndex={idx} />;
                        idx += slice.length;
                        return <div key={type}>{block}</div>;
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="cl-a4-pane cl-a4-pane--waybill">
                <WaybillPanel
                  {...waybillShared}
                  continuation={chunkIndex > 0}
                  chunkIndex={chunkIndex}
                  grouped={grouped}
                  cutStartIndex={chunkIndex * rowsPerPage}
                />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
