import {
  ZAREWA_QUOTATION_BRANDING,
  DEFAULT_QUOTATION_PRINT_LINES,
  QUOTATION_TERMS_FOOTER,
  QUOTATION_PAYMENT_NOTICE,
  ZAREWA_COMPANY_ACCOUNT_NAME,
} from '../Data/companyQuotation';

/** System accent — matches Sales / Dashboard teal */
const ACCENT = '#134e4a';
const ACCENT_SOFT = '#e6f4f2';

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

function LineRow({ name, qty, unitPrice, value, alt, cellClass }) {
  return (
    <tr className="quotation-print-tr">
      <td className={`${cellClass} ${alt ? 'bg-slate-50/90' : 'bg-white'} border-slate-200`}>{name}</td>
      <td
        className={`${cellClass} text-right tabular-nums border-slate-200 ${alt ? 'bg-slate-50/90' : 'bg-white'}`}
      >
        {formatQty(qty)}
      </td>
      <td
        className={`${cellClass} text-right tabular-nums border-slate-200 ${alt ? 'bg-slate-50/90' : 'bg-white'}`}
      >
        {formatNgn(unitPrice)}
      </td>
      <td
        className={`${cellClass} text-right font-semibold tabular-nums text-slate-900 border-slate-200 ${
          alt ? 'bg-slate-50/90' : 'bg-white'
        }`}
      >
        {formatNgn(value)}
      </td>
    </tr>
  );
}

function CategoryHeader({ label }) {
  return (
    <tr className="quotation-print-tr">
      <td
        colSpan={4}
        className="border border-slate-200 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white print:text-[8px]"
        style={{ backgroundColor: ACCENT }}
      >
        {label}
      </td>
    </tr>
  );
}

function SubTotalRow({ label, amount }) {
  return (
    <tr className="quotation-print-tr">
      <td
        colSpan={3}
        className="border border-slate-200 px-1.5 py-1 text-right text-[9px] font-semibold text-[#134e4a] print:text-[8px]"
        style={{ backgroundColor: ACCENT_SOFT }}
      >
        {label}
      </td>
      <td
        className="border border-slate-200 px-1.5 py-1 text-right text-[9px] font-bold tabular-nums text-white print:text-[8px]"
        style={{ backgroundColor: ACCENT }}
      >
        {formatNgn(amount)}
      </td>
    </tr>
  );
}

export default function QuotationPrintView({
  quotationId = 'QT—',
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

  const cell = 'border px-1.5 py-1 text-[9px] sm:text-[10px] print:text-[8px] leading-tight text-slate-800';
  const th = `${cell} bg-slate-100 font-bold uppercase text-[#134e4a] text-[8px] print:text-[7px]`;

  return (
    <div className="quotation-print-a4 relative text-slate-900">
      {/* Watermark — subtle, system accent */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04] print:opacity-[0.035]"
        aria-hidden
      >
        <span
          className="select-none text-[140px] font-black tracking-tighter print:text-[120px]"
          style={{ color: ACCENT }}
        >
          ZP
        </span>
      </div>

      <div className="relative border border-slate-200 bg-white p-3 sm:p-5 print:p-3 print:shadow-none rounded-xl print:rounded-none border-t-4 border-t-[#134e4a]">
        {/* Header */}
        <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 pb-3 print:pb-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white sm:h-14 sm:w-14 print:h-11 print:w-11">
            <img src={b.logoSrc} alt="" className="h-10 w-10 object-contain print:h-9 print:w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-tight tracking-tight text-[#134e4a] sm:text-lg print:text-[13pt]">
              {b.legalName}
            </h1>
            <p className="mt-0.5 text-center text-[9px] font-medium text-slate-600 sm:text-left print:text-[7.5pt]">
              {b.poBox}
            </p>
            <p className="text-center text-[9px] text-slate-600 sm:text-left print:text-[7.5pt]">{b.email}</p>
          </div>
        </header>

        {/* Branch contacts — compact grid for A4 */}
        <div className="mt-3 grid grid-cols-1 gap-2 border-b border-slate-200 pb-3 print:mt-2 print:pb-2 sm:grid-cols-3">
          {b.branches.map((br) => (
            <div key={br.title} className="text-[8px] leading-snug text-slate-700 print:text-[7pt]">
              <p className="font-bold uppercase text-[#134e4a]">{br.title}</p>
              {br.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ))}
        </div>

        {/* Title banner */}
        <div
          className="relative mt-3 overflow-hidden rounded-md py-2 text-center print:mt-2 print:py-1.5"
          style={{ backgroundColor: ACCENT }}
        >
          <h2 className="relative text-sm font-bold uppercase tracking-[0.15em] text-white print:text-[11pt]">
            Quotation
          </h2>
        </div>

        {/* Meta grid */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 print:mt-2">
          <dl className="space-y-0.5 text-[9px] print:text-[7.5pt]">
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 font-semibold text-[#134e4a]">Quotation ID</dt>
              <dd className="font-medium">{quotationId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 font-semibold text-[#134e4a]">Terms</dt>
              <dd>{terms}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 font-semibold text-[#134e4a]">Gauge</dt>
              <dd>{gauge}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 font-semibold text-[#134e4a]">Customer</dt>
              <dd className="font-medium">{customerName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 font-semibold text-[#134e4a]">Project</dt>
              <dd className="min-w-0 break-words font-medium">{projectName?.trim() ? projectName.trim() : '—'}</dd>
            </div>
          </dl>
          <dl className="space-y-0.5 text-[9px] sm:text-right print:text-[7.5pt]">
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-20 shrink-0 font-semibold text-[#134e4a] sm:w-24">Date</dt>
              <dd>{dateStr ?? '—'}</dd>
            </div>
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-20 shrink-0 font-semibold text-[#134e4a] sm:w-24">Design</dt>
              <dd>{design}</dd>
            </div>
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-20 shrink-0 font-semibold text-[#134e4a] sm:w-24">Color</dt>
              <dd>{color}</dd>
            </div>
            <div className="flex gap-2 sm:flex-row-reverse sm:text-right">
              <dt className="w-20 shrink-0 font-semibold text-[#134e4a] sm:w-24">Phone / Ref.</dt>
              <dd>{customerPhone}</dd>
            </div>
          </dl>
        </div>

        {/* Line items — wide tables may span multiple A4 pages; rows stay intact */}
        <table className="quotation-print-table mt-3 w-full border-collapse text-left print:mt-2">
          <thead className="print:table-header-group">
            <tr>
              <th className={`${th} border-slate-200`}>Product</th>
              <th className={`${th} border-slate-200 text-right`}>Qty / m</th>
              <th className={`${th} border-slate-200 text-right`}>Unit</th>
              <th className={`${th} border-slate-200 text-right`}>Value</th>
            </tr>
          </thead>
          <tbody>
            <CategoryHeader label="A. Products" />
              {products.map((r, i) => (
                <LineRow key={r.name + i} {...r} alt={i % 2 === 1} cellClass={cell} />
            ))}
            <SubTotalRow label="Subtotal (products)" amount={subA} />

            <CategoryHeader label="B. Accessories" />
              {accessories.map((r, i) => (
                <LineRow key={r.name + i} {...r} alt={i % 2 === 1} cellClass={cell} />
            ))}
            <SubTotalRow label="Subtotal (accessories)" amount={subB} />

            <CategoryHeader label="C. Services" />
              {services.map((r, i) => (
                <LineRow key={r.name + i} {...r} alt={i % 2 === 1} cellClass={cell} />
            ))}
            <SubTotalRow label="Subtotal (services)" amount={subC} />

            <tr className="quotation-print-tr">
              <td
                colSpan={3}
                className="border border-slate-200 px-1.5 py-1.5 text-right text-[10px] font-bold uppercase text-[#134e4a] print:text-[9px]"
                style={{ backgroundColor: ACCENT_SOFT }}
              >
                Grand total
              </td>
              <td
                className="border border-slate-200 px-1.5 py-1.5 text-right text-[11px] font-bold tabular-nums text-white print:text-[10px]"
                style={{ backgroundColor: ACCENT }}
              >
                {formatNgn(grand)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer blocks: keep together when possible */}
        <div className="mt-3 space-y-3 print:mt-2">
          <div
            className="rounded-md px-2 py-1.5 text-center text-[8px] font-semibold uppercase leading-snug tracking-wide text-white print:text-[7pt]"
            style={{ backgroundColor: ACCENT }}
          >
            {QUOTATION_PAYMENT_NOTICE}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 print:px-1.5 print:py-0.5">
            <p className="text-[7.5px] font-bold uppercase tracking-wide text-[#134e4a] print:text-[6.5pt]">
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

          <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-[#134e4a] print:text-[7.5pt]">
            Quotation valid for {validityDays} days only
          </p>
          <p className="text-justify text-[8px] leading-snug text-slate-600 print:text-[7pt]">{QUOTATION_TERMS_FOOTER}</p>
          {salesperson && salesperson !== '—' && (
            <p className="text-[8px] text-[#134e4a] print:text-[7pt]">
              Prepared by: <span className="font-semibold uppercase">{salesperson}</span>
            </p>
          )}

          <div className="quotation-print-signatures grid grid-cols-1 gap-6 border-t border-slate-200 pt-4 sm:grid-cols-2 print:gap-4 print:pt-3">
            <div>
              <p className="text-[8px] font-semibold text-[#134e4a] print:text-[7pt]">Yours faithfully,</p>
              <p className="text-[9px] font-bold text-slate-800 print:text-[7.5pt]">{b.legalName}</p>
              <div className="mt-6 border-b border-slate-400 pb-1 text-[8px] text-slate-600 print:mt-4 print:text-[7pt]">
                Marketing manager
              </div>
              <p className="mt-1 text-[8px] text-slate-500 print:text-[7pt]">Phone no.</p>
            </div>
            <div>
              <p className="text-[8px] font-semibold text-[#134e4a] print:text-[7pt]">Customer</p>
              <div className="mt-8 border-b border-slate-400 pb-1 text-[8px] text-slate-600 print:mt-6 print:text-[7pt]">
                Signature
              </div>
              <div className="mt-3 border-b border-slate-400 pb-1 text-[8px] text-slate-600 print:text-[7pt]">
                Phone no.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
