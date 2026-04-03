/* eslint-disable react-refresh/only-export-components -- print helpers are colocated with the view */
import {
  ZAREWA_QUOTATION_BRANDING,
  DEFAULT_QUOTATION_PRINT_LINES,
  QUOTATION_TERMS_FOOTER,
  QUOTATION_PAYMENT_NOTICE,
  ZAREWA_COMPANY_ACCOUNT_NAME,
  ZAREWA_DOC_BLUE,
  ZAREWA_DOC_BLUE_SOFT,
} from '../Data/companyQuotation';

const ACCENT = ZAREWA_DOC_BLUE;
const ACCENT_SOFT = ZAREWA_DOC_BLUE_SOFT;

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

function LineRow({ name, qty, unitPrice, value, alt, cellClass, borderClass }) {
  return (
    <tr className="quotation-print-tr">
      <td className={`${cellClass} ${alt ? 'bg-slate-50/90' : 'bg-white'} ${borderClass}`}>{name}</td>
      <td className={`${cellClass} text-right tabular-nums ${borderClass} ${alt ? 'bg-slate-50/90' : 'bg-white'}`}>
        {formatQty(qty)}
      </td>
      <td className={`${cellClass} text-right tabular-nums ${borderClass} ${alt ? 'bg-slate-50/90' : 'bg-white'}`}>
        {formatNgn(unitPrice)}
      </td>
      <td
        className={`${cellClass} text-right font-semibold tabular-nums text-slate-900 ${borderClass} ${
          alt ? 'bg-slate-50/90' : 'bg-white'
        }`}
      >
        {formatNgn(value)}
      </td>
    </tr>
  );
}

function CategoryHeader({ label, borderClass }) {
  return (
    <tr className="quotation-print-tr">
      <td
        colSpan={4}
        className={`border px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white print:text-[8px] ${borderClass}`}
        style={{ backgroundColor: ACCENT, borderColor: ACCENT }}
      >
        {label}
      </td>
    </tr>
  );
}

function SubTotalRow({ label, amount, borderClass }) {
  return (
    <tr className="quotation-print-tr">
      <td
        colSpan={3}
        className={`border px-1.5 py-1 text-right text-[9px] font-semibold print:text-[8px] ${borderClass}`}
        style={{ color: ACCENT, backgroundColor: ACCENT_SOFT }}
      >
        {label}
      </td>
      <td
        className={`border px-1.5 py-1 text-right text-[9px] font-bold tabular-nums text-white print:text-[8px] ${borderClass}`}
        style={{ backgroundColor: ACCENT, borderColor: ACCENT }}
      >
        {formatNgn(amount)}
      </td>
    </tr>
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

  const cell =
    'border px-1.5 py-1 text-[9px] sm:text-[10px] print:text-[8px] leading-tight text-slate-800';
  const th = `${cell} bg-slate-100 font-bold uppercase text-[8px] print:text-[7px]`;
  const tableBorder = 'border-[#1e3a8a]/35';

  const showValidity = documentKind === 'quotation';
  const footerTerms =
    documentKind === 'receipt'
      ? 'This receipt acknowledges payment received as stated. Retain for your records. Outstanding balance (if any) remains payable per agreed terms.'
      : QUOTATION_TERMS_FOOTER;

  return (
    <div className="quotation-print-a4 relative text-slate-900">
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06] print:opacity-[0.05]"
        aria-hidden
      >
        <span
          className="select-none font-serif text-[140px] font-black tracking-tighter print:text-[120px]"
          style={{ color: ACCENT }}
        >
          ZP
        </span>
      </div>

      <div
        className={`relative border-2 bg-white p-3 sm:p-5 print:p-3 print:shadow-none rounded-xl print:rounded-none ${tableBorder}`}
        style={{ borderTopColor: ACCENT, borderTopWidth: '4px' }}
      >
        <header className="flex flex-wrap items-start gap-3 border-b-2 pb-3 print:pb-2" style={{ borderColor: ACCENT }}>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border-2 sm:h-14 sm:w-14 print:h-11 print:w-11"
            style={{ borderColor: ACCENT, backgroundColor: '#5b21b6' }}
          >
            <img src={b.logoSrc} alt="" className="h-10 w-10 object-contain print:h-9 print:w-9" />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1
              className="font-serif text-base font-bold leading-tight tracking-tight sm:text-lg print:text-[14pt]"
              style={{ color: ACCENT }}
            >
              {b.legalName}
            </h1>
            <p className="mt-0.5 text-[9px] font-medium text-slate-700 print:text-[7.5pt]">{b.poBox}</p>
            <p className="text-[9px] text-slate-700 print:text-[7.5pt]">Email: {b.email}</p>
          </div>
        </header>

        <div className="mt-3 grid grid-cols-1 gap-2 border-b-2 pb-3 print:mt-2 print:pb-2 sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: ACCENT }}>
          {b.branches.map((br) => (
            <div key={br.title} className="text-[7.5px] leading-snug text-slate-800 print:text-[7pt]">
              <p className="font-bold uppercase" style={{ color: ACCENT }}>
                {br.title}
              </p>
              {br.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-3 border-2 py-2 text-center print:mt-2 print:py-1.5" style={{ borderColor: ACCENT, backgroundColor: ACCENT }}>
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white print:text-[12pt]">{title}</h2>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 print:mt-2">
          <dl className="space-y-0.5 text-[9px] print:text-[7.5pt]">
            <div className="flex gap-2">
              <dt className="w-[6.25rem] shrink-0 font-semibold" style={{ color: ACCENT }}>
                {primaryMetaLabel(documentKind)}
              </dt>
              <dd className="font-medium">{primaryId}</dd>
            </div>
            {documentKind === 'receipt' && linkedQuotationId ? (
              <div className="flex gap-2">
                <dt className="w-[6.25rem] shrink-0 font-semibold" style={{ color: ACCENT }}>
                  Quotation
                </dt>
                <dd className="font-medium">{linkedQuotationId}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-[6.25rem] shrink-0 font-semibold" style={{ color: ACCENT }}>
                Terms
              </dt>
              <dd>{terms}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[6.25rem] shrink-0 font-semibold" style={{ color: ACCENT }}>
                Gauge
              </dt>
              <dd>{gauge}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[6.25rem] shrink-0 font-semibold" style={{ color: ACCENT }}>
                Customer
              </dt>
              <dd className="font-medium">{customerName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[6.25rem] shrink-0 font-semibold" style={{ color: ACCENT }}>
                Project
              </dt>
              <dd className="min-w-0 break-words font-medium">{projectName?.trim() ? projectName.trim() : '—'}</dd>
            </div>
          </dl>
          <dl className="space-y-0.5 text-[9px] sm:text-right print:text-[7.5pt]">
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-24 shrink-0 font-semibold sm:w-28" style={{ color: ACCENT }}>
                Date
              </dt>
              <dd>{dateStr ?? '—'}</dd>
            </div>
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-24 shrink-0 font-semibold sm:w-28" style={{ color: ACCENT }}>
                Design
              </dt>
              <dd>{design}</dd>
            </div>
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-24 shrink-0 font-semibold sm:w-28" style={{ color: ACCENT }}>
                Color
              </dt>
              <dd>{color}</dd>
            </div>
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-24 shrink-0 font-semibold sm:w-28" style={{ color: ACCENT }}>
                Phone / Ref.
              </dt>
              <dd>{customerPhone}</dd>
            </div>
            {documentKind === 'receipt' && amountPaidNgn != null && balanceDueNgn != null ? (
              <>
                <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
                  <dt className="w-24 shrink-0 font-semibold sm:w-28" style={{ color: ACCENT }}>
                    Amount paid
                  </dt>
                  <dd className="font-bold tabular-nums">{formatNgn(amountPaidNgn)}</dd>
                </div>
                <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
                  <dt className="w-24 shrink-0 font-semibold sm:w-28" style={{ color: ACCENT }}>
                    Balance due
                  </dt>
                  <dd className="font-bold tabular-nums">{formatNgn(balanceDueNgn)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        <table className={`quotation-print-table mt-3 w-full border-collapse text-left print:mt-2 ${tableBorder}`}>
          <thead className="print:table-header-group">
            <tr>
              <th className={`${th} ${tableBorder}`} style={{ color: ACCENT }}>
                Product
              </th>
              <th className={`${th} ${tableBorder} text-right`} style={{ color: ACCENT }}>
                Quantity / Meters
              </th>
              <th className={`${th} ${tableBorder} text-right`} style={{ color: ACCENT }}>
                Unit price
              </th>
              <th className={`${th} ${tableBorder} text-right`} style={{ color: ACCENT }}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            <CategoryHeader label="A. Product" borderClass={tableBorder} />
            {products.map((r, i) => (
              <LineRow key={r.name + i} {...r} alt={i % 2 === 1} cellClass={cell} borderClass={tableBorder} />
            ))}
            <SubTotalRow label="Sub total" amount={subA} borderClass={tableBorder} />

            <CategoryHeader label="B. Accessories" borderClass={tableBorder} />
            {accessories.map((r, i) => (
              <LineRow key={r.name + i} {...r} alt={i % 2 === 1} cellClass={cell} borderClass={tableBorder} />
            ))}
            <SubTotalRow label="Sub total" amount={subB} borderClass={tableBorder} />

            <CategoryHeader label="C. Services" borderClass={tableBorder} />
            {services.map((r, i) => (
              <LineRow key={r.name + i} {...r} alt={i % 2 === 1} cellClass={cell} borderClass={tableBorder} />
            ))}
            <SubTotalRow label="Sub total" amount={subC} borderClass={tableBorder} />

            <tr className="quotation-print-tr">
              <td
                colSpan={3}
                className={`border px-1.5 py-1.5 text-right text-[10px] font-bold uppercase print:text-[9px] ${tableBorder}`}
                style={{ color: ACCENT, backgroundColor: ACCENT_SOFT }}
              >
                Grand total
              </td>
              <td
                className={`border px-1.5 py-1.5 text-right text-[11px] font-bold tabular-nums text-white print:text-[10px] ${tableBorder}`}
                style={{ backgroundColor: ACCENT, borderColor: ACCENT }}
              >
                {formatNgn(grand)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 space-y-3 print:mt-2">
          <div
            className="px-2 py-2 text-center text-[8px] font-bold uppercase leading-snug tracking-wide text-white print:text-[7pt]"
            style={{ backgroundColor: ACCENT }}
          >
            {QUOTATION_PAYMENT_NOTICE}
          </div>

          <div
            className="border-2 bg-slate-50 px-2 py-1 print:px-1.5 print:py-0.5"
            style={{ borderColor: ACCENT }}
          >
            <p className="text-[7.5px] font-bold uppercase tracking-wide print:text-[6.5pt]" style={{ color: ACCENT }}>
              Pay into
            </p>
            <p className="mt-0.5 text-[8px] leading-snug text-slate-800 print:text-[7pt]">
              <span className="font-semibold text-slate-600">Bank:</span> {bankName}
              <span className="mx-1.5 text-slate-300 print:mx-1">|</span>
              <span className="font-semibold text-slate-600">A/C:</span>{' '}
              <span className="font-mono font-semibold tabular-nums">{accNo}</span>
              <span className="mx-1.5 text-slate-300 print:mx-1">|</span>
              <span className="font-semibold text-slate-600">Name:</span> {accName}
            </p>
          </div>

          {showValidity ? (
            <p className="text-center text-[9px] font-bold uppercase tracking-wide print:text-[7.5pt]" style={{ color: ACCENT }}>
              Quotation valid for {validityDays} days only
            </p>
          ) : null}
          <p className="text-justify text-[8px] leading-snug text-slate-600 print:text-[7pt]">{footerTerms}</p>
          {salesperson && salesperson !== '—' ? (
            <p className="text-[8px] print:text-[7pt]" style={{ color: ACCENT }}>
              Prepared by: <span className="font-semibold uppercase">{salesperson}</span>
            </p>
          ) : null}

          <div className="quotation-print-signatures grid grid-cols-1 gap-6 border-t-2 pt-4 sm:grid-cols-2 print:gap-4 print:pt-3" style={{ borderColor: ACCENT }}>
            <div>
              <p className="text-[8px] font-semibold print:text-[7pt]" style={{ color: ACCENT }}>
                Yours faithfully,
              </p>
              <p className="text-[9px] font-bold text-slate-900 print:text-[7.5pt]">{b.legalName}</p>
              <div className="mt-6 border-b border-slate-500 pb-1 text-[8px] text-slate-600 print:mt-4 print:text-[7pt]">
                Marketing Manager
              </div>
              <p className="mt-1 text-[8px] text-slate-500 print:text-[7pt]">Phone no.</p>
            </div>
            <div>
              <p className="text-[8px] font-semibold print:text-[7pt]" style={{ color: ACCENT }}>
                Customer
              </p>
              <div className="mt-8 border-b border-slate-500 pb-1 text-[8px] text-slate-600 print:mt-6 print:text-[7pt]">
                Signature:
              </div>
              <div className="mt-3 border-b border-slate-500 pb-1 text-[8px] text-slate-600 print:text-[7pt]">
                Phone No:
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
