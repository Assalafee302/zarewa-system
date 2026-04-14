import {
  ZAREWA_QUOTATION_BRANDING,
  ZAREWA_DOC_BLUE,
  ZAREWA_DOC_MAROON,
} from '../../Data/companyQuotation';

const ACCENT = ZAREWA_DOC_BLUE;
const MAROON = ZAREWA_DOC_MAROON;

/**
 * Pilot layout for internal printable reports: letterhead, A4 content width, watermark, card body.
 * Use with outer wrapper `quotation-print-root quotation-print-preview-mode` for correct @media print.
 */
export function StandardReportPrintShell({
  documentTypeLabel = 'Internal document',
  title,
  subtitle,
  /** Defaults to company legal name from branding */
  legalNameLine,
  /** Optional right column (e.g. refs, status, printed time) */
  rightColumn = null,
  watermarkText = 'ZP',
  children,
  footer,
}) {
  const b = ZAREWA_QUOTATION_BRANDING;
  const legal = legalNameLine ?? b.legalName;

  return (
    <div className="quotation-print-a4 relative mx-auto max-w-4xl w-full overflow-hidden bg-slate-100/80 p-3 font-sans text-slate-800 shadow-lg print:max-w-none print:w-full print:overflow-visible print:bg-white print:p-0 print:shadow-none sm:p-5">
      <div
        className="quotation-print-watermark pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.028] print:opacity-[0.04]"
        aria-hidden
      >
        <span className="select-none text-[11rem] font-bold leading-none text-slate-400 sm:text-[15rem] print:text-[13rem]">
          {watermarkText}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-md print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        <div className="px-5 py-5 sm:px-8 sm:py-6 print:px-6 print:py-5">
          <header
            className="flex flex-col gap-4 border-b-2 pb-4 print:gap-3 print:pb-3 lg:flex-row lg:items-start lg:justify-between"
            style={{ borderColor: ACCENT }}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md p-2 text-xl font-bold text-white shadow-sm print:h-12 print:w-12 sm:h-16 sm:w-16"
                style={{ backgroundColor: MAROON }}
              >
                {b.logoSrc ? (
                  <img src={b.logoSrc} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  'ZP'
                )}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 print:text-[9pt]">
                  {documentTypeLabel}
                </p>
                <h1 className="mt-1 text-xl font-bold uppercase leading-tight tracking-tight text-slate-900 print:text-[16pt]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1 text-[12px] font-medium text-slate-700 print:text-[10.5pt]">{subtitle}</p>
                ) : null}
                <p className="mt-1 text-[12px] text-slate-600 print:text-[10.5pt]">{legal}</p>
              </div>
            </div>
            {rightColumn ? (
              <div className="text-right text-[11px] leading-relaxed text-slate-700 print:text-[10pt]">
                {rightColumn}
              </div>
            ) : null}
          </header>

          <div className="mt-5 print:mt-4">{children}</div>

          {footer ? (
            <footer className="mt-6 border-t border-slate-200 pt-4 text-center text-[10px] leading-relaxed text-slate-500 print:mt-5 print:text-[9pt]">
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </div>
  );
}
