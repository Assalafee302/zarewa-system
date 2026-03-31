/**
 * Demo pack mirroring the legacy paper cutting list (QT02027 / CT01592 style).
 * Used by Sales mock data and optional API seed for a full transaction test.
 */

/** Length (m) × qty — roofing sheet lines from reference sheet (totals 1888.85 m). */
export const LAGACY_ROOF_LENGTH_QTY = [
  [9.9, 30],
  [9.8, 2],
  [9.2, 2],
  [8.9, 18],
  [8.3, 2],
  [7.9, 2],
  [7.4, 1],
  [7.1, 2],
  [6.9, 29],
  [6.85, 40],
  [6.8, 28],
  [6.7, 4],
  [6.5, 1],
  [6.3, 1],
  [6.1, 4],
  [5.95, 35],
  [5.7, 1],
  [5.6, 26],
  [5.1, 1],
  [5.0, 2],
  [4.95, 1],
  [4.9, 1],
  [4.8, 4],
  [4.65, 15],
  [4.6, 5],
  [4.5, 14],
  [4.4, 5],
  [4.2, 1],
  [4.1, 3],
  [3.4, 1],
  [3.3, 2],
  [3.2, 1],
];

export const LAGACY_FLAT_LENGTH_QTY = [[132.5, 1]];

const roofLines = LAGACY_ROOF_LENGTH_QTY.map(([lengthM, sheets], i) => ({
  lineNo: i + 1,
  lineType: 'Roof',
  sheets,
  lengthM,
  totalM: Math.round(sheets * lengthM * 100) / 100,
}));

const flatLines = LAGACY_FLAT_LENGTH_QTY.map(([lengthM, sheets], i) => ({
  lineNo: roofLines.length + i + 1,
  lineType: 'Flatsheet',
  sheets,
  lengthM,
  totalM: Math.round(sheets * lengthM * 100) / 100,
}));

export const LAGACY_CUTTING_LIST_LINES = [...roofLines, ...flatLines];

const roofSheets = LAGACY_ROOF_LENGTH_QTY.reduce((s, [, q]) => s + q, 0);
const flatSheets = LAGACY_FLAT_LENGTH_QTY.reduce((s, [, q]) => s + q, 0);
export const LAGACY_SHEETS_TO_CUT = roofSheets + flatSheets;
export const LAGACY_TOTAL_METERS = LAGACY_CUTTING_LIST_LINES.reduce((s, l) => s + l.totalM, 0);

/** Quotation line JSON (products / accessories / services) — amounts match paper subtotals & grand total. */
export const LAGACY_LINES_JSON = {
  materialGauge: '0.70mm',
  materialColor: 'P RED',
  materialDesign: 'Longspan (Indus6)',
  products: [
    { id: 'lag-p1', name: 'Roofing sheet', qty: '1888.85', unitPrice: '12000' },
    { id: 'lag-p2', name: 'Flat sheet', qty: '132.5', unitPrice: '12000' },
    { id: 'lag-p3', name: 'Bending', qty: '1', unitPrice: '7500' },
  ],
  accessories: [
    { id: 'lag-a1', name: 'Silicon tube', qty: '4', unitPrice: '3500' },
    { id: 'lag-a2', name: 'Rivet pins', qty: '4', unitPrice: '6500' },
    { id: 'lag-a3', name: 'Tapping screw', qty: '12000', unitPrice: '120' },
  ],
  services: [
    { id: 'lag-s1', name: 'Installation', qty: '1', unitPrice: '1250000' },
    { id: 'lag-s2', name: 'Transportation', qty: '1', unitPrice: '100000' },
  ],
};

/** Integer naira (matches DB seed; within ₦1 of float total from line math). */
export const LAGACY_QUOTATION_TOTAL_NGN = 27_093_700;
export const LAGACY_RECEIPT_AMOUNT_NGN = 31_202_000;

export const LAGACY_CUSTOMER = {
  customerID: 'CUS-NDA',
  name: 'NDA',
  phoneNumber: '—',
  email: '',
  addressShipping: '38 Reg Course Legacy Project site',
  addressBilling: 'As per shipping',
  status: 'Active',
  tier: 'Regular',
  paymentTerms: 'Per quotation',
  createdBy: 'Auwal Idris',
  createdAtISO: '2026-08-01',
  lastActivityISO: '2026-08-11',
};

export const LAGACY_QUOTATION = {
  id: 'QT-2026-027',
  customerID: 'CUS-NDA',
  customer: 'NDA',
  date: '11 Aug',
  dateISO: '2026-08-11',
  dueDateISO: '2026-09-10',
  total: '₦27,093,700',
  totalNgn: LAGACY_QUOTATION_TOTAL_NGN,
  paidNgn: LAGACY_RECEIPT_AMOUNT_NGN,
  paymentStatus: 'Paid',
  status: 'Approved',
  approvalDate: '11 Aug 2026',
  customerFeedback: '',
  handledBy: 'Auwal Idris',
  projectName: '38 REG COURSE LEGACY PROJECT',
  materialGauge: LAGACY_LINES_JSON.materialGauge,
  materialColor: LAGACY_LINES_JSON.materialColor,
  materialDesign: LAGACY_LINES_JSON.materialDesign,
  quotationLines: {
    products: LAGACY_LINES_JSON.products,
    accessories: LAGACY_LINES_JSON.accessories,
    services: LAGACY_LINES_JSON.services,
  },
};

export const LAGACY_RECEIPT = {
  id: 'RC-2026-1849',
  customerID: 'CUS-NDA',
  customer: 'NDA',
  quotationRef: 'QT-2026-027',
  date: '11 Aug',
  dateISO: '2026-08-11',
  amount: '₦31,202,000',
  amountNgn: LAGACY_RECEIPT_AMOUNT_NGN,
  method: 'Bank transfer',
  bankReference: 'TAJ Bank',
  status: 'Posted',
  handledBy: 'Cashier — Hauwa',
};

export const LAGACY_CUTTING_LIST = {
  id: 'CL-2026-1592',
  customerID: 'CUS-NDA',
  customer: 'NDA',
  quotationRef: 'QT-2026-027',
  productID: 'FG-101',
  productName: 'Longspan (Indus6) · P RED · 0.70mm',
  date: '11 Aug',
  dateISO: '2026-08-11',
  sheetsToCut: LAGACY_SHEETS_TO_CUT,
  totalMeters: LAGACY_TOTAL_METERS,
  total: `${LAGACY_TOTAL_METERS.toLocaleString('en-NG', { maximumFractionDigits: 2 })} m`,
  status: 'Waiting',
  machineName: 'Machine 01 (Longspan)',
  operatorName: '',
  productionRegistered: false,
  productionRegisterRef: '',
  handledBy: 'Auwal Idris',
  lines: LAGACY_CUTTING_LIST_LINES,
};
