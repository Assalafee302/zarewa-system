/* eslint-disable react-refresh/only-export-components -- print helpers are colocated with the view */
import {
  ZAREWA_QUOTATION_BRANDING,
  DEFAULT_QUOTATION_PRINT_LINES,
  QUOTATION_TERMS_FOOTER,
  QUOTATION_PAYMENT_NOTICE,
  ZAREWA_COMPANY_ACCOUNT_NAME,
  ZAREWA_DOC_BLUE,
  ZAREWA_DOC_BLUE_SOFT,
  ZAREWA_DOC_MAROON,
} from '../Data/companyQuotation';

const ACCENT = ZAREWA_DOC_BLUE;
const ACCENT_SOFT = ZAREWA_DOC_BLUE_SOFT;
const MAROON = ZAREWA_DOC_MAROON;

/** @typedef {'quotation' | 'invoice' | 'receipt'} QuotationDocumentKind */

function formatNgn(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return '₦0.00';
  return `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sumLines(lines) {
  return (lines ?? []).reduce((s, r) => s + (Number(r.value) || 0), 0);
}

function formatQty(q) {
  const n = Number(q);
  if (Number.isNaN(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

function parseLineNum(s) {
  const n = Number(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build print line groups from persisted quotation line JSON (form or API shape).
 * @param {unknown} quotationLines
 * @param {typeof DEFAULT_QUOTATION_PRINT_LINES} [fallbackLines]
 */
export function normalizeQuotationLinesForPrint(quotationLines, fallbackLines = DEFAULT_QUOTATION_PRINT_LINES) {
  if (!quotationLines || typeof quotationLines !== 'object') return fallbackLines;
  const { products, accessories, services } = /** @type {{ products?: unknown[]; accessories?: unknown[]; services?: unknown[] }} */ (
    quotationLines
  );
  if (!Array.isArray(products) || !Array.isArray(accessories) || !Array.isArray(services)) return fallbackLines;

  const mapRows = (rows) => {
    const filled = (rows || []).filter((r) => String(/** @type {{ name?: string }} */ (r).name ?? '').trim());
    if (filled.length === 0) return [{ name: '—', qty: 0, unitPrice: 0, value: 0 }];
    return filled.map((r) => {
      const row = /** @type {{ name?: string; qty?: unknown; unitPrice?: unknown }} */ (r);
      const qty = parseLineNum(row.qty);
      const unitPrice = parseLineNum(row.unitPrice);
      return { name: String(row.name).trim(), qty, unitPrice, value: qty * unitPrice };
    });
  };

  return {
    products: mapRows(products),
    accessories: mapRows(accessories),
    services: mapRows(services),
  };
}

const CELL = 'px-3 py-2 align-middle text-[9px] leading-snug sm:text-[10px] print:px-2.5 print:py-1.5 print:text-[8pt]';
const TH_CELL = `${CELL} font-bold uppercase tracking-wide text-[8px] sm:text-[9px] print:text-[7.5pt]`;

function PrintLineRow({ name, qty, unitPrice, value }) {
  return (
    <tr className="quotation-print-tr quotation-print-line border-b border-slate-100">
      <td className={`${CELL} text-slate-800`}>{name}</td>
      <td className={`${CELL} border-x border-slate-100 text-center tabular-nums text-slate-800`}>{formatQty(qty)}</td>
      <td className={`${CELL} border-r border-slate-100 text-right tabular-nums text-slate-800`}>{formatNgn(unitPrice)}</td>
      <td className={`${CELL} text-right font-semibold tabular-nums text-slate-900`}>{formatNgn(value)}</td>
    </tr>
  );
}

function PrintSectionLabel({ label, noTopRule = false }) {
  return (
    <tr className={`quotation-print-tr bg-slate-50 ${noTopRule ? '' : 'border-t border-slate-200'}`}>
      <td
        colSpan={4}
        className="border-l-[3px] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-800 sm:text-[10px] print:px-2.5 print:text-[8pt]"
        style={{ borderLeftColor: ACCENT }}
      >
        {label}
      </td>
    </tr>
  );
}

function PrintSubtotalRow({ label, amount }) {
  return (
    <tr className="quotation-print-tr bg-slate-50/80">
      <td colSpan={3} className={`${CELL} text-right italic text-slate-600`}>
        {label}:
      </td>
      <td
        className={`${CELL} border-b-2 text-right font-bold tabular-nums text-slate-900`}
        style={{ borderColor: ACCENT }}
      >
        {formatNgn(amount)}
      </td>
    </tr>
  );
}

/** One aligned label / value pair for meta blocks */
function MetaField({ label, children, valueClass = '' }) {
  return (
    <div className="grid grid-cols-[minmax(6.5rem,7.5rem)_1fr] items-baseline gap-x-3 gap-y-0 text-[10px] sm:text-[11px] print:text-[8.5pt]">
      <span className="shrink-0 font-bold leading-snug" style={{ color: ACCENT }}>
        {label}
      </span>
      <span className={`min-w-0 break-words leading-snug text-slate-800 ${valueClass}`}>{children}</span>
    </div>
  );
}

function docTitle(kind) {
  if (kind === 'invoice') return 'Invoice';
  if (kind === 'receipt') return 'Receipt';
  return 'Quotation';
}

function primaryMetaLabel(kind) {
  if (kind === 'invoice') return 'Invoice no.';
  if (kind === 'receipt') return 'Receipt ref.';
  return 'Quotation ID';
}

export default function QuotationPrintView({
  documentKind = /** @type {QuotationDocumentKind} */ ('quotation'),
  quotationId = 'QT—',
  /** Receipt number when `documentKind` is receipt */
  receiptRef = '',
  /** Show linked quotation on receipt */
  linkedQuotationId = '',
  dateStr,
  customerName = '—',
  customerPhone = '—',
  projectName = '—',
  terms = '100%',
  gauge = '—',
  design = '—',
  color = '—',
  payAccount = null,
  lines = DEFAULT_QUOTATION_PRINT_LINES,
  salesperson = '—',
  validityDays = '___',
  /** Receipt only — amount already paid (incl. this voucher when previewing) */
  amountPaidNgn = null,
  /** Receipt only — outstanding after paid */
  balanceDueNgn = null,
}) {
  const b = ZAREWA_QUOTATION_BRANDING;
  const products = lines?.products ?? DEFAULT_QUOTATION_PRINT_LINES.products;
  const accessories = lines?.accessories ?? DEFAULT_QUOTATION_PRINT_LINES.accessories;
  const services = lines?.services ?? DEFAULT_QUOTATION_PRINT_LINES.services;

  const subA = sumLines(products);
  const subB = sumLines(accessories);
  const subC = sumLines(services);
  const grand = subA + subB + subC;

  const bankName = payAccount?.bankName ?? '—';
  const accNo = payAccount?.accNo ?? '—';
  const accName = payAccount?.accountName ?? ZAREWA_COMPANY_ACCOUNT_NAME;

  const title = docTitle(documentKind);
  const primaryId =
    documentKind === 'receipt' && receiptRef ? receiptRef : quotationId;

  const showValidity = documentKind === 'quotation';
  const footerTerms =
    documentKind === 'receipt'
      ? 'This receipt acknowledges payment received as stated. Retain for your records. Outstanding balance (if any) remains payable per agreed terms.'
      : QUOTATION_TERMS_FOOTER;

  const signatureCompany = b.signatureLegalName ?? b.legalName;
  const customerLabel =
    documentKind === 'receipt' ? 'Customer' : 'Customer name';

  return (
    <div className="quotation-print-a4 relative mx-auto max-w-4xl w-full overflow-hidden bg-slate-100/80 p-3 font-sans text-slate-800 shadow-lg print:max-w-none print:w-full print:overflow-visible print:bg-white print:p-0 print:shadow-none sm:p-5">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.028] print:opacity-[0.04]" aria-hidden>
        <span className="select-none text-[11rem] font-bold leading-none text-slate-400 sm:text-[15rem] print:text-[13rem]">
          ZP
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-md print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        <div className="px-5 py-5 sm:px-8 sm:py-6 print:px-6 print:py-5">
          <header
            className="flex flex-col gap-5 border-b-2 pb-5 print:gap-4 print:pb-4 lg:flex-row lg:items-start lg:justify-between"
            style={{ borderColor: ACCENT }}
          >
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div
                className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center overflow-hidden rounded-md p-2 text-2xl font-bold text-white shadow-sm print:h-14 print:w-14 sm:h-[4.5rem] sm:w-[4.5rem]"
                style={{ backgroundColor: MAROON }}
              >
                {b.logoSrc ? (
                  <img src={b.logoSrc} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  'ZP'
                )}
              </div>
              <div className="min-w-0 pt-0.5">
                <h1 className="text-[15px] font-bold uppercase leading-snug tracking-tight text-slate-900 sm:text-lg print:text-[13pt]">
                  {b.legalName}
                </h1>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-600 sm:text-[11px] print:text-[8.5pt]">{b.poBox}</p>
                <p className="mt-0.5 text-[10px] text-slate-600 sm:text-[11px] print:text-[8.5pt]">
                  <span className="font-semibold" style={{ color: ACCENT }}>
                    Email
                  </span>{' '}
                  {b.email}
                </p>
              </div>
            </div>
            <div className="grid w-full shrink-0 grid-cols-1 gap-4 text-[9px] leading-relaxed text-slate-700 sm:grid-cols-3 sm:gap-5 sm:text-[8.5px] lg:max-w-[58%] lg:text-right xl:max-w-[55%] print:max-w-[60%] print:text-[7.5pt]">
              {b.branches.map((br, idx) => (
                <div
                  key={br.title}
                  className={`min-w-0 lg:text-right ${idx > 0 ? 'border-t border-slate-200 pt-3 sm:border-t-0 sm:border-l sm:border-slate-200 sm:pl-4 sm:pt-0 lg:pl-5' : ''}`}
                >
                  <p className="mb-1 font-bold uppercase tracking-wide" style={{ color: ACCENT }}>
                    {br.title}
                  </p>
                  {br.lines.map((line, i) => (
                    <p key={i} className="text-slate-600">
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </header>

          <div
            className="mt-5 rounded-sm py-2.5 text-center print:mt-4 print:py-2"
            style={{ backgroundColor: ACCENT }}
          >
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white sm:text-xs print:text-[10.5pt]">
              {title}
            </h2>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-4 border-b border-slate-200 pb-5 print:mt-4 print:gap-y-3 print:pb-4 lg:grid-cols-2">
            <div className="space-y-2.5 print:space-y-2">
              <MetaField label={primaryMetaLabel(documentKind)}>{primaryId}</MetaField>
              {documentKind === 'receipt' && linkedQuotationId ? (
                <MetaField label="Quotation">{linkedQuotationId}</MetaField>
              ) : null}
              <MetaField label={customerLabel}>{customerName}</MetaField>
              <MetaField label="Project">{projectName?.trim() ? projectName.trim() : '—'}</MetaField>
              <MetaField label="Terms">{terms}</MetaField>
              <MetaField label="Gauge">{gauge}</MetaField>
              <MetaField label="Colour">{color}</MetaField>
            </div>
            <div className="space-y-2.5 border-t border-slate-100 pt-4 lg:border-t-0 lg:pt-0 print:space-y-2">
              <MetaField label="Date">{dateStr ?? '—'}</MetaField>
              <MetaField label="Phone / Ref.">{customerPhone}</MetaField>
              <MetaField label="Design">{design}</MetaField>
              {documentKind === 'receipt' && amountPaidNgn != null && balanceDueNgn != null ? (
                <>
                  <MetaField label="Amount paid" valueClass="font-semibold tabular-nums text-slate-900">
                    {formatNgn(amountPaidNgn)}
                  </MetaField>
                  <MetaField label="Balance due" valueClass="font-semibold tabular-nums text-slate-900">
                    {formatNgn(balanceDueNgn)}
                  </MetaField>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto print:mt-4 print:max-w-full print:overflow-visible">
            <table className="quotation-print-table w-full table-fixed border-collapse border border-slate-200 text-left text-sm print:text-[9pt]">
              <colgroup>
                <col className="w-[40%] sm:w-[42%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="print:table-header-group">
                <tr style={{ backgroundColor: ACCENT_SOFT }}>
                  <th scope="col" className={`${TH_CELL} border-b-2 border-slate-200 text-left text-slate-800`} style={{ borderBottomColor: ACCENT }}>
                    Product
                  </th>
                  <th
                    scope="col"
                    className={`${TH_CELL} border-b-2 border-x border-slate-200 text-center text-slate-800`}
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Qty / Metres
                  </th>
                  <th
                    scope="col"
                    className={`${TH_CELL} border-b-2 border-slate-200 text-right text-slate-800`}
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Unit price
                  </th>
                  <th
                    scope="col"
                    className={`${TH_CELL} border-b-2 border-slate-200 text-right text-slate-800`}
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                <PrintSectionLabel label="A. Product" noTopRule />
                {products.map((r, i) => (
                  <PrintLineRow key={`${r.name}-${i}`} {...r} />
                ))}
                <PrintSubtotalRow label="Sub total" amount={subA} />

                <PrintSectionLabel label="B. Accessories" />
                {accessories.map((r, i) => (
                  <PrintLineRow key={`${r.name}-${i}`} {...r} />
                ))}
                <PrintSubtotalRow label="Sub total" amount={subB} />

                <PrintSectionLabel label="C. Services" />
                {services.map((r, i) => (
                  <PrintLineRow key={`${r.name}-${i}`} {...r} />
                ))}
                <PrintSubtotalRow label="Sub total" amount={subC} />
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50" style={{ borderTopColor: ACCENT }}>
                  <td colSpan={3} className={`${CELL} py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-800 sm:py-3.5 sm:text-xs print:py-2.5 print:text-[9.5pt]`}>
                    Grand total
                  </td>
                  <td
                    className={`${CELL} py-3 text-right text-[11px] font-bold tabular-nums text-slate-900 sm:py-3.5 sm:text-sm print:py-2.5 print:text-[10pt]`}
                    style={{ boxShadow: `inset 0 0 0 2px ${ACCENT}` }}
                  >
                    {formatNgn(grand)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div
            className="mt-6 rounded-sm px-3 py-2.5 text-center text-[9px] font-bold uppercase leading-snug tracking-wide text-white print:mt-5 print:px-2 print:py-2 print:text-[7.5pt]"
            style={{ backgroundColor: ACCENT }}
          >
            {QUOTATION_PAYMENT_NOTICE}
          </div>

          <div className="mt-5 space-y-4 print:mt-4 print:space-y-3">
            <div
              className="rounded-md border border-slate-200 px-3 py-3 print:px-2.5 print:py-2"
              style={{ backgroundColor: ACCENT_SOFT, borderColor: ACCENT }}
            >
              <p className="text-[8px] font-bold uppercase tracking-wide text-slate-700 print:text-[7pt]">Pay into</p>
              <div className="mt-2 grid gap-1.5 text-[9px] leading-relaxed text-slate-800 print:text-[7.5pt] sm:grid-cols-[auto_1fr] sm:gap-x-4">
                <div className="flex flex-wrap items-baseline gap-x-1 sm:block">
                  <span className="font-semibold text-slate-600">Bank</span>
                  <span className="hidden sm:inline">: </span>
                  <span>{bankName}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-1 sm:block">
                  <span className="font-semibold text-slate-600">Account no.</span>
                  <span className="hidden sm:inline">: </span>
                  <span className="font-mono font-semibold tabular-nums">{accNo}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-semibold text-slate-600">Account name</span>
                  <span>: </span>
                  <span>{accName}</span>
                </div>
              </div>
            </div>

            {showValidity ? (
              <p className="text-center text-[9px] font-bold uppercase tracking-wide text-slate-700 print:text-[7.5pt]">
                <span style={{ color: ACCENT }}>Quotation valid for {validityDays} days only</span>
              </p>
            ) : null}
            <p className="text-justify text-[8px] leading-relaxed text-slate-600 print:text-[7pt]">{footerTerms}</p>
            {salesperson && salesperson !== '—' ? (
              <p className="text-[8px] text-slate-600 print:text-[7pt]">
                <span className="font-semibold" style={{ color: ACCENT }}>
                  Prepared by
                </span>
                : <span className="font-semibold uppercase text-slate-800">{salesperson}</span>
              </p>
            ) : null}

            <div
              className="quotation-print-signatures grid grid-cols-1 gap-8 border-t-2 border-slate-200 pt-5 sm:grid-cols-2 sm:gap-10 print:gap-6 print:pt-4"
              style={{ borderTopColor: ACCENT }}
            >
              <div className="min-w-0">
                {b.marketingSignatoryName ? (
                  <p className="text-[9px] font-bold uppercase text-slate-900 print:text-[8pt]">{b.marketingSignatoryName}</p>
                ) : null}
                <p className="mt-1 text-[8px] font-semibold print:text-[7pt]" style={{ color: ACCENT }}>
                  Yours faithfully,
                </p>
                <p className="mt-0.5 text-[9px] font-bold text-slate-900 print:text-[7.5pt]">{signatureCompany}</p>
                <div className="mt-8 border-b border-slate-400 pb-1 text-[8px] text-slate-600 print:mt-6 print:text-[7pt]">
                  Marketing Manager
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-semibold uppercase print:text-[7pt]" style={{ color: ACCENT }}>
                  Customer
                </p>
                <div className="mt-10 border-b border-slate-400 pb-1 text-[8px] text-slate-600 print:mt-8 print:text-[7pt]">
                  Signature
                </div>
                <div className="mt-4 border-b border-slate-400 pb-1 text-[8px] text-slate-600 print:mt-3 print:text-[7pt]">
                  Phone no.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
