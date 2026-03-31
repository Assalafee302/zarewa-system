import { ZAREWA_QUOTATION_BRANDING } from '../Data/companyQuotation';
import { formatNgn } from '../Data/mockData';
import { CUTTING_LIST_REPORT_ROWS_PER_PAGE } from './cuttingListReportConstants';

export { CUTTING_LIST_REPORT_ROWS_PER_PAGE } from './cuttingListReportConstants';

const LINE_CATEGORIES = [
  { type: 'Roof', title: 'Roofing sheet' },
  { type: 'Flatsheet', title: 'Flat sheet' },
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

function flattenCuttingLines(linesByCat) {
  const out = [];
  for (const { type } of LINE_CATEGORIES) {
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

function CuttingCategoryTable({ title, lines, startIndex }) {
  if (!lines?.length) return null;
  let catM = 0;
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
            catM += lineM;
            return (
              <tr key={line.id ?? `r-${startIndex + i}`}>
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

function ProductionScratchpad({ footerName }) {
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
          <span className="cl-factory-field-label">Meters produced</span>
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
        <p className="cl-factory-scratch-footer">{footerName || '—'}</p>
      </div>
    </div>
  );
}

/**
 * Factory cutting list — A5 portrait: cutting lengths column first (top-aligned), commercial + receipts + scratchpad second.
 */
export default function CuttingListReportPrintView({
  cuttingListId,
  quotationRef,
  selectedQuotation,
  materialSpec,
  dateISO,
  machineName,
  operatorName = '',
  totalMeters,
  sheetsToCut,
  linesByCat,
  receiptsForQuotation = [],
  statusLabel = '—',
  productionFooterName = '',
}) {
  const b = ZAREWA_QUOTATION_BRANDING;
  const flatLines = flattenCuttingLines(linesByCat);
  const chunks = chunkLines(flatLines, CUTTING_LIST_REPORT_ROWS_PER_PAGE);
  const totalChunks = chunks.length;

  const ql = selectedQuotation?.quotationLines;
  const products = ql?.products ?? [];
  const accessories = ql?.accessories ?? [];
  const services = ql?.services ?? [];
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

  const cutDate = dateISO || selectedQuotation?.dateISO || '—';

  return (
    <div className="cutting-list-a5-report-root cutting-list-factory-root cl-factory-theme bg-white text-slate-900 antialiased">
      {chunks.map((chunk, chunkIndex) => {
        const grouped = groupByType(chunk);
        let idx = chunkIndex * CUTTING_LIST_REPORT_ROWS_PER_PAGE;

        return (
          <section
            key={chunkIndex}
            className={`cutting-list-a5-sheet ${chunkIndex > 0 ? 'cutting-list-a5-sheet--continuation' : ''} ${chunkIndex < totalChunks - 1 ? 'cutting-list-a5-sheet--break-after' : ''}`}
          >
            <header className="cl-factory-banner">
              <div className="cl-factory-banner-accent" aria-hidden />
              <div className="cl-factory-banner-inner">
                <div className="cl-factory-banner-left">
                  <div className="cl-factory-logo-ring">
                    <img src={b.logoSrc} alt="" className="cl-factory-logo-img" />
                  </div>
                  <div className="cl-factory-banner-titles">
                    <p className="cl-factory-legal-name">{b.legalName}</p>
                    <h1 className="cl-factory-doc-title">Cutting list</h1>
                  </div>
                </div>
              </div>
              <div className="cl-factory-banner-refline" aria-label="Cutting list references">
                <span className="cl-factory-ref-group">
                  <span className="cl-factory-ref-k">List</span>
                  <span className="cl-factory-ref-v font-mono">{cuttingListId}</span>
                </span>
                <span className="cl-factory-ref-sep">·</span>
                <span className="cl-factory-ref-group">
                  <span className="cl-factory-ref-k">Date</span>
                  <span className="cl-factory-ref-v">{cutDate}</span>
                </span>
                <span className="cl-factory-ref-sep">·</span>
                <span className="cl-factory-ref-group">
                  <span className="cl-factory-ref-k">Quotation</span>
                  <span className="cl-factory-ref-v font-mono">{quotationRef || '—'}</span>
                </span>
              </div>
              <div className="cl-factory-subbar cl-factory-subbar--triple">
                <span className="cl-factory-subbar-seg">
                  <span className="cl-factory-subbar-k">Project</span>
                  <span className="cl-factory-subbar-v">{selectedQuotation?.projectName ?? '—'}</span>
                </span>
                <span className="cl-factory-subbar-seg">
                  <span className="cl-factory-subbar-k">Material</span>
                  <span className="cl-factory-subbar-v">{materialLine || '—'}</span>
                </span>
                <span className="cl-factory-subbar-seg">
                  <span className="cl-factory-subbar-k">Machine</span>
                  <span className="cl-factory-subbar-v">{machineName || '—'}</span>
                </span>
              </div>
            </header>

            {chunkIndex === 0 ? (
              <div className="cl-factory-body cl-factory-body--cut-first">
                {/* Column 1: cutting lengths — top-aligned, primary */}
                <div className="cl-factory-col-cut cl-factory-panel cl-factory-panel--accent cl-factory-panel--cut-list min-w-0">
                  {LINE_CATEGORIES.map(({ type, title }) => {
                    const slice = grouped[type];
                    if (!slice.length) return null;
                    const block = <CuttingCategoryTable title={title} lines={slice} startIndex={idx} />;
                    idx += slice.length;
                    return <div key={type}>{block}</div>;
                  })}
                  {chunk.length === 0 ? (
                    <p className="cl-factory-cut-empty">No cutting lines with qty and length.</p>
                  ) : null}
                </div>

                {/* Column 2: commercial + receipts + scratchpad */}
                <div className="cl-factory-col-commercial cl-factory-panel min-w-0">
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
                        <div key={r.id} className="cl-factory-receipt-row">
                          <span className="cl-factory-receipt-id font-mono">{r.id}</span>
                          <span className="cl-factory-receipt-sep">·</span>
                          <span className="cl-factory-receipt-date">{r.date ?? r.dateISO}</span>
                          <span className="cl-factory-receipt-sep">·</span>
                          <span className="cl-factory-receipt-amt tabular-nums">{r.amount ?? formatNgn(r.amountNgn)}</span>
                          <span className="cl-factory-receipt-sep">·</span>
                          <span className="cl-factory-receipt-bank">{r.bankReference || r.method || r.paymentMethod || '—'}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="cl-factory-chips" aria-label="Production context">
                    {operatorName ? <span className="cl-factory-chip">{operatorName}</span> : null}
                    <span className="cl-factory-chip cl-factory-chip--muted">{statusLabel}</span>
                    <span className="cl-factory-chip cl-factory-chip--accent">
                      {sheetsToCut ?? '—'} sheets · {typeof totalMeters === 'number' ? totalMeters.toLocaleString() : totalMeters} m
                    </span>
                  </div>

                  <ProductionScratchpad footerName={productionFooterName} />
                </div>
              </div>
            ) : (
              <div className="cl-factory-continue">
                <p className="cl-factory-continue-bar">
                  <span className="cl-factory-continue-tag">Continuation</span>
                  <span className="cl-factory-continue-body">
                    {cuttingListId} · {quotationRef || '—'} · section {chunkIndex + 1} of {totalChunks} (lines{' '}
                    {chunkIndex * CUTTING_LIST_REPORT_ROWS_PER_PAGE + 1}–
                    {chunkIndex * CUTTING_LIST_REPORT_ROWS_PER_PAGE + chunk.length})
                  </span>
                </p>
                <div className="cl-factory-col-right cl-factory-col-right--full cl-factory-panel cl-factory-panel--accent cl-factory-panel--cut-list min-w-0">
                  {LINE_CATEGORIES.map(({ type, title }) => {
                    const slice = grouped[type];
                    if (!slice.length) return null;
                    const block = <CuttingCategoryTable title={title} lines={slice} startIndex={idx} />;
                    idx += slice.length;
                    return <div key={type}>{block}</div>;
                  })}
                </div>
              </div>
            )}

            <p className="cl-factory-page-foot">
              <span className="cl-factory-page-foot-brand">Zarewa</span> · section {chunkIndex + 1}/{totalChunks} · up to{' '}
              {CUTTING_LIST_REPORT_ROWS_PER_PAGE} cutting lines per sheet
            </p>
          </section>
        );
      })}
    </div>
  );
}
