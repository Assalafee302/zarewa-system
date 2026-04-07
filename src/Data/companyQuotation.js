/** Branding and sample line structure for customer-facing quotation printouts. */

export const ZAREWA_COMPANY_ACCOUNT_NAME = 'ZAREWA ALUMINIUM AND PLASTICS LTD';

/** Served from `public/` — official ZP mark (PNG). */
export const ZAREWA_LOGO_SRC = '/zarewa-logo.png';

export const ZAREWA_QUOTATION_BRANDING = {
  legalName: ZAREWA_COMPANY_ACCOUNT_NAME,
  /** Shown under “Yours faithfully” on printed quotes (matches letterhead ampersand). */
  signatureLegalName: 'ZAREWA ALUMINIUM & PLASTICS LTD',
  /** Printed above “Yours faithfully” (marketing signatory line). */
  marketingSignatoryName: 'AUWAL',
  poBox: 'P.O. BOX 7068, KADUNA',
  email: 'zarewaglobal@gmail.com',
  logoSrc: ZAREWA_LOGO_SRC,
  branches: [
    {
      title: 'KADUNA HEAD OFFICE',
      lines: [
        'No A1 Kaduna–Zaria Road, Unguwan Gwari, Kawo, Kaduna State.',
        'Tel: +234 803 000 0000 · +234 806 000 0000 · +234 809 000 0000',
      ],
    },
    {
      title: 'YOLA FACTORY',
      lines: [
        'Yola Numan Road, 1 km from welcome to Yola, Adamawa State.',
        'Tel: +234 701 000 0000',
      ],
    },
    {
      title: 'MAIDUGURI FACTORY',
      lines: [
        'Airport Road, behind Yola Electric Building, Bulunkutu, Maiduguri, Borno State.',
        'Tel: +234 902 000 0000',
      ],
    },
  ],
};

/** Primary ink / borders for official quotation / invoice / receipt printouts */
export const ZAREWA_DOC_BLUE = '#1a3a5a';
/** Light panel tint paired with ZAREWA_DOC_BLUE */
export const ZAREWA_DOC_BLUE_SOFT = '#e9eef4';
/** Letterhead mark background (ZP block) */
export const ZAREWA_DOC_MAROON = '#7b2c5a';

/**
 * Demo line items matching a typical longspan quote (amounts align to a coherent grand total).
 * Replace with API / form lines when quotation lines are persisted.
 */
export const DEFAULT_QUOTATION_PRINT_LINES = {
  products: [
    { name: 'Top End', qty: 30, unitPrice: 2000, value: 60000 },
    { name: 'Barge board', qty: 14, unitPrice: 2000, value: 28000 },
    { name: 'Eave angle', qty: 60, unitPrice: 850, value: 51000 },
    { name: 'Capping', qty: 50, unitPrice: 2000, value: 100000 },
    { name: 'Flat sheet', qty: 47, unitPrice: 4850, value: 227950 },
    { name: 'Roofing sheet', qty: 340.3, unitPrice: 4850, value: 1650454.94 },
  ],
  accessories: [
    { name: 'Drive screw nail', qty: 24, unitPrice: 2500, value: 60000 },
    { name: 'Rivet pins', qty: 1, unitPrice: 6500, value: 6500 },
  ],
  services: [
    { name: 'Transportation', qty: 1, unitPrice: 40000, value: 40000 },
    { name: 'Installation', qty: 1, unitPrice: 300000, value: 300000 },
  ],
};

export const QUOTATION_TERMS_FOOTER = `Prices are subject to change without prior notice. This quotation is valid for the period stated below. The customer is responsible for verifying quantities, specifications, and site measurements before confirming the order.`;

export const QUOTATION_PAYMENT_NOTICE =
  "NOTE: NO CASH TRANSACTIONS. ALL PAYMENTS MUST BE MADE TO THE COMPANY'S ACCOUNT.";
