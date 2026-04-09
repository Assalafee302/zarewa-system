/**
 * Frontend-only mock data for Zarewa System.
 * Not connected to a database — replace fetches with API calls when the backend is ready.
 */

import { REFERENCE_STOCK_CALIBRATION } from './stockReference';
import {
  LAGACY_CUSTOMER,
  LAGACY_CUTTING_LIST,
  LAGACY_QUOTATION,
  LAGACY_RECEIPT,
} from './lagacyCuttingListDemo';

const { longspanThinQty, aluzinc028Kg, heavyCoilKg, tappingScrewCartons } =
  REFERENCE_STOCK_CALIBRATION;

/** @param {number} n */
export function formatNgn(n) {
  return `₦${Number(n).toLocaleString()}`;
}

/**
 * Customer records (tblCustomer-shaped for future API).
 * @typedef {Object} Customer
 * @property {string} customerID
 * @property {string} name
 * @property {string} phoneNumber
 * @property {string} email
 * @property {string} addressShipping
 * @property {string} addressBilling
 * @property {'Active'|'Inactive'} status
 * @property {'Regular'|'VIP'|'Wholesale'|'Trade'} tier
 * @property {string} paymentTerms
 */
export const CUSTOMERS_MOCK = [
  {
    customerID: 'CUS-001',
    name: 'Alhaji Musa',
    phoneNumber: '+234 803 555 0142',
    email: 'musa.roofing@example.com',
    addressShipping: 'Plot 12, Zaria Road, Kano',
    addressBilling: 'Same as shipping',
    status: 'Active',
    tier: 'Wholesale',
    paymentTerms: 'Net 30',
    createdBy: 'Auwal Idris',
    createdAtISO: '2025-08-12',
    lastActivityISO: '2026-03-28',
  },
  {
    customerID: 'CUS-002',
    name: 'Grace Emmanuel',
    phoneNumber: '+234 805 222 9011',
    email: 'grace.e@builders.ng',
    addressShipping: '14 Ahmadu Bello Way, Jos',
    addressBilling: 'P.O. Box 440, Jos',
    status: 'Active',
    tier: 'VIP',
    paymentTerms: 'Net 14',
    createdBy: 'Mary Okafor',
    createdAtISO: '2025-11-03',
    lastActivityISO: '2026-03-27',
  },
  {
    customerID: 'CUS-003',
    name: 'Bello Ibrahim',
    phoneNumber: '+234 802 100 7733',
    email: 'bello.ibrahim@example.com',
    addressShipping: 'Kaduna Industral Layout, Shed 8',
    addressBilling: 'Same as shipping',
    status: 'Active',
    tier: 'Regular',
    paymentTerms: 'Due on receipt',
    createdBy: 'Zainab Yusuf',
    createdAtISO: '2026-01-20',
    lastActivityISO: '2026-03-24',
  },
  LAGACY_CUSTOMER,
  {
    customerID: 'CUS-004',
    name: 'Zaidu Roofing Ltd',
    phoneNumber: '+234 907 444 2200',
    email: 'procurement@zaidu.ng',
    addressShipping: 'Tal\'udu GRA, Sokoto',
    addressBilling: 'Accounts Dept., Sokoto HQ',
    status: 'Active',
    tier: 'Wholesale',
    paymentTerms: 'Net 60',
    createdBy: 'Auwal Idris',
    createdAtISO: '2025-05-18',
    lastActivityISO: '2026-03-25',
  },
];

/**
 * Dispatch / delivery jobs linked to quotations (frontend demo).
 * @typedef {Object} Delivery
 * @property {string} id
 * @property {string} quotationRef
 * @property {string} customer
 * @property {string} destination
 * @property {string} method
 * @property {'Scheduled'|'Loading'|'In transit'|'Delivered'|'Exception'} status
 * @property {string} trackingNo
 * @property {string} shipDate
 * @property {string} eta
 */
export const DELIVERIES_MOCK = [
  {
    id: 'DN-2026-008',
    quotationRef: 'QT-2026-001',
    customer: 'Alhaji Musa',
    destination: 'Kano — Site B (Zaria Rd)',
    method: 'Company truck',
    status: 'In transit',
    trackingNo: 'ZW-TRK-8821',
    shipDate: '29 Mar 2026',
    eta: '30 Mar 2026',
  },
  {
    id: 'DN-2026-007',
    quotationRef: 'QT-2026-002',
    customer: 'Grace Emmanuel',
    destination: 'Jos — Liberty Quarters',
    method: 'Third-party haulage',
    status: 'Scheduled',
    trackingNo: '—',
    shipDate: '31 Mar 2026',
    eta: '2 Apr 2026',
  },
  {
    id: 'DN-2026-004',
    quotationRef: 'QT-2026-000',
    customer: 'Zaidu Roofing Ltd',
    destination: 'Sokoto — Central depot',
    method: 'Customer pickup',
    status: 'Delivered',
    trackingNo: 'PICKUP-ZW-04',
    shipDate: '22 Mar 2026',
    eta: '22 Mar 2026',
  },
];

/**
 * Yard / store coil register for Sales sidebar (merged with live GRN lots by id).
 * @typedef {{ id: string, colour: string, gaugeLabel: string, materialType: string, weightKg: number, loc?: string | null }} SalesYardCoilRow
 */
export const SALES_YARD_COIL_REGISTER = [
  { id: 'COIL-1882', colour: 'HMB', gaugeLabel: '0.24', materialType: 'Aluzinc longspan', weightKg: 3279, loc: 'Bay A' },
  { id: 'COIL-1908', colour: 'TB', gaugeLabel: '0.24', materialType: 'Aluzinc longspan', weightKg: 3428, loc: 'Bay A' },
  { id: 'COIL-1878', colour: 'GB', gaugeLabel: '0.55', materialType: 'Aluzinc longspan', weightKg: 732, loc: 'Bay B' },
  { id: 'COIL-1912', colour: 'IV', gaugeLabel: '0.20', materialType: 'Aluzinc longspan', weightKg: 2890, loc: 'Bay A' },
  { id: 'COIL-1913', colour: 'PR', gaugeLabel: '0.24', materialType: 'Aluzinc longspan', weightKg: 3055, loc: 'Bay C' },
  { id: 'COIL-1914', colour: 'BG', gaugeLabel: '0.22', materialType: 'Aluzinc longspan', weightKg: 2180, loc: 'Bay C' },
  { id: 'COIL-1915', colour: 'NB', gaugeLabel: '0.24', materialType: 'Aluzinc longspan', weightKg: 2644, loc: 'Bay A' },
  { id: 'COIL-1916', colour: 'ST', gaugeLabel: '0.45', materialType: 'Aluzinc longspan', weightKg: 1890, loc: 'Heavy rack' },
  { id: 'COIL-1917', colour: 'DG', gaugeLabel: '0.40', materialType: 'Aluzinc longspan', weightKg: 2120, loc: 'Heavy rack' },
  { id: 'COIL-1918', colour: 'GB', gaugeLabel: '0.28', materialType: 'Aluzinc longspan', weightKg: 4120, loc: 'Bay B' },
  { id: 'COIL-1919', colour: 'IV', gaugeLabel: '0.24', materialType: 'Aluzinc longspan', weightKg: 3380, loc: 'Bay B' },
  { id: 'COIL-1920', colour: 'HMB', gaugeLabel: '0.28', materialType: 'Aluzinc longspan', weightKg: 2765, loc: 'Bay D' },
  { id: 'COIL-1921', colour: 'TB', gaugeLabel: '0.30', materialType: 'Aluzinc longspan', weightKg: 1950, loc: 'Bay D' },
  { id: 'COIL-1922', colour: 'PR', gaugeLabel: '0.20', materialType: 'Aluzinc longspan', weightKg: 1420, loc: 'Bay C' },
  { id: 'COIL-1923', colour: 'GB', gaugeLabel: '0.24', materialType: 'Aluzinc metcoppo', weightKg: 990, loc: 'Metcoppo' },
  { id: 'COIL-1924', colour: 'TC Red', gaugeLabel: '0.45', materialType: 'Colour-coated longspan', weightKg: 760, loc: 'Colour bay' },
  { id: 'COIL-1925', colour: 'Bush Grn', gaugeLabel: '0.45', materialType: 'Colour-coated longspan', weightKg: 640, loc: 'Colour bay' },
  { id: 'COIL-1926', colour: 'IV', gaugeLabel: '0.18', materialType: 'Aluzinc longspan (thin)', weightKg: 1180, loc: 'Thin line' },
  { id: 'COIL-1927', colour: 'HMB', gaugeLabel: '0.22', materialType: 'Aluzinc longspan', weightKg: 2234, loc: 'Bay A' },
];

/** Sales workspace — mirrors future API entities (quotations, receipts, etc.) */
export const SALES_MOCK = {
  availableStock: [
    { id: 'COIL-1882', material: 'HM Blue', gauge: '0.24', color: 'Blue', weight: '3,279kg' },
    { id: 'COIL-1908', material: 'Traffic Black', gauge: '0.24', color: 'Black', weight: '3,428kg' },
    { id: 'COIL-1878', material: 'HM Blue', gauge: '0.55', color: 'Blue', weight: '732kg' },
  ],
  quotations: [
    {
      id: 'QT-2026-001',
      customerID: 'CUS-001',
      customer: 'Alhaji Musa',
      date: '27 Mar',
      dateISO: '2026-03-27',
      dueDateISO: '2026-04-26',
      total: '₦1,450,000',
      totalNgn: 1450000,
      paidNgn: 1020000,
      paymentStatus: 'Partial',
      status: 'Pending',
      approvalDate: '',
      customerFeedback: '',
      handledBy: 'Auwal Idris',
      materialGauge: '0.45mm',
      materialColor: 'Heritage Blue',
      materialDesign: 'Longspan',
    },
    {
      id: 'QT-2026-002',
      customerID: 'CUS-002',
      customer: 'Grace Emmanuel',
      date: '26 Mar',
      dateISO: '2026-03-26',
      dueDateISO: '2026-04-09',
      total: '₦880,000',
      totalNgn: 880000,
      paidNgn: 620000,
      paymentStatus: 'Partial',
      status: 'Approved',
      approvalDate: '26 Mar 2026',
      customerFeedback: 'Approved by phone — proceed to production.',
      handledBy: 'Mary Okafor',
      materialGauge: '0.40mm',
      materialColor: 'Traffic White',
      materialDesign: 'Steeltile',
    },
    {
      id: 'QT-2026-003',
      customerID: 'CUS-004',
      customer: 'Zaidu Roofing Ltd',
      date: '25 Mar',
      dateISO: '2026-03-25',
      dueDateISO: '2026-04-24',
      total: '₦2,100,000',
      totalNgn: 2100000,
      paidNgn: 2100000,
      paymentStatus: 'Paid',
      status: 'Approved',
      approvalDate: '25 Mar 2026',
      customerFeedback: 'Full payment received.',
      handledBy: 'Zainab Yusuf',
      materialGauge: '0.50mm',
      materialColor: 'Bush Brown',
      materialDesign: 'Metcoppo',
    },
    {
      id: 'QT-2026-004',
      customerID: 'CUS-003',
      customer: 'Bello Ibrahim',
      date: '24 Mar',
      dateISO: '2026-03-24',
      dueDateISO: '2026-03-20',
      total: '₦620,000',
      totalNgn: 620000,
      paidNgn: 0,
      paymentStatus: 'Unpaid',
      status: 'Pending',
      approvalDate: '',
      customerFeedback: '',
      handledBy: 'Mary Okafor',
      materialGauge: '0.45mm',
      materialColor: 'Charcoal Grey',
      materialDesign: 'Longspan',
    },
    {
      id: 'QT-2026-000',
      customerID: 'CUS-004',
      customer: 'Zaidu Roofing Ltd',
      date: '18 Mar',
      dateISO: '2026-03-18',
      dueDateISO: '2026-03-18',
      total: '₦980,000',
      totalNgn: 980000,
      paidNgn: 980000,
      paymentStatus: 'Paid',
      status: 'Approved',
      approvalDate: '18 Mar 2026',
      customerFeedback: 'Pickup arranged.',
      handledBy: 'Zainab Yusuf',
      materialGauge: '0.45mm',
      materialColor: 'Jasper Green',
      materialDesign: 'Longspan',
    },
    {
      id: 'QT-2026-005',
      customerID: 'CUS-001',
      customer: 'Alhaji Musa',
      date: '15 Mar',
      dateISO: '2026-03-15',
      dueDateISO: '2026-03-30',
      total: '₦320,000',
      totalNgn: 320000,
      paidNgn: 320000,
      paymentStatus: 'Paid',
      status: 'Approved',
      approvalDate: '16 Mar 2026',
      customerFeedback: '',
      handledBy: 'Auwal Idris',
    },
    {
      id: 'QT-2026-006',
      customerID: 'CUS-001',
      customer: 'Alhaji Musa',
      date: '2 Mar',
      dateISO: '2026-03-02',
      dueDateISO: '2026-03-16',
      total: '₦2,400,000',
      totalNgn: 2400000,
      paidNgn: 2400000,
      paymentStatus: 'Paid',
      status: 'Approved',
      approvalDate: '4 Mar 2026',
      customerFeedback: '',
      handledBy: 'Mary Okafor',
    },
    {
      id: 'QT-2026-007',
      customerID: 'CUS-002',
      customer: 'Grace Emmanuel',
      date: '10 Mar',
      dateISO: '2026-03-10',
      dueDateISO: '2026-03-24',
      total: '₦410,000',
      totalNgn: 410000,
      paidNgn: 410000,
      paymentStatus: 'Paid',
      status: 'Approved',
      approvalDate: '11 Mar 2026',
      customerFeedback: '',
      handledBy: 'Zainab Yusuf',
    },
    LAGACY_QUOTATION,
  ],
  receipts: [
    {
      id: 'RC-2026-014',
      customerID: 'CUS-001',
      customer: 'Alhaji Musa',
      quotationRef: 'QT-2026-001',
      date: '28 Mar',
      dateISO: '2026-03-28',
      amount: '₦400,000',
      amountNgn: 400000,
      method: 'Bank Transfer',
      status: 'Posted',
      handledBy: 'Cashier — Hauwa',
    },
    {
      id: 'RC-2026-013',
      customerID: 'CUS-002',
      customer: 'Grace Emmanuel',
      quotationRef: 'QT-2026-002',
      date: '27 Mar',
      dateISO: '2026-03-27',
      amount: '₦200,000',
      amountNgn: 200000,
      method: 'POS',
      status: 'Posted',
      handledBy: 'Cashier — Hauwa',
    },
    {
      id: 'RC-2026-012',
      customerID: 'CUS-004',
      customer: 'Zaidu Roofing Ltd',
      quotationRef: 'QT-2026-003',
      date: '25 Mar',
      dateISO: '2026-03-25',
      amount: '₦2,100,000',
      amountNgn: 2100000,
      method: 'Bank Transfer',
      status: 'Posted',
      handledBy: 'Cashier — Hauwa',
    },
    {
      id: 'RC-2026-010',
      customerID: 'CUS-001',
      customer: 'Alhaji Musa',
      quotationRef: 'QT-2026-005',
      date: '16 Mar',
      dateISO: '2026-03-16',
      amount: '₦320,000',
      amountNgn: 320000,
      method: 'Cash',
      status: 'Posted',
      handledBy: 'Cashier — Musa',
    },
    {
      id: 'RC-2026-008',
      customerID: 'CUS-002',
      customer: 'Grace Emmanuel',
      quotationRef: 'QT-2026-007',
      date: '11 Mar',
      dateISO: '2026-03-11',
      amount: '₦410,000',
      amountNgn: 410000,
      method: 'Bank Transfer',
      status: 'Posted',
      handledBy: 'Cashier — Hauwa',
    },
    LAGACY_RECEIPT,
  ],
  /** Demo legacy pack (QT-2026-027 / CL-2026-1592) — full factory cutting list test. */
  cuttingLists: [LAGACY_CUTTING_LIST],
  /** Refund requests (Sales → Refunds). */
  refunds: [
    {
      refundID: 'RF-2026-001',
      customerID: 'CUS-001',
      customer: 'Alhaji Musa',
      quotationRef: 'QT-2026-001',
      cuttingListRef: 'CL-2026-005',
      product: 'Longspan roofing 0.45mm HM Blue',
      reasonCategory: 'Short supply (quoted vs cutting list)',
      reason: 'Short supply (quoted vs cutting list) — Quoted 500m; cutting list 450.5m',
      amountNgn: 75000,
      calculationLines: [
        { label: 'Metres not supplied (49.5m @ blended rate)', amountNgn: 62000 },
        { label: 'Transport allocation reversal', amountNgn: 13000 },
      ],
      calculationNotes: 'Quote assumed 500m roofline; cutting list total 450.5m after site measure.',
      status: 'Pending',
      approvalDate: '',
      managerComments: '',
      requestedBy: 'Auwal Idris',
      requestedAtISO: '2026-03-28T09:15:00.000Z',
      approvedBy: '',
      paidAtISO: '',
      paidBy: '',
    },
    {
      refundID: 'RF-2026-002',
      customerID: 'CUS-002',
      customer: 'Grace Emmanuel',
      quotationRef: 'QT-2026-002',
      cuttingListRef: '',
      product: 'Accessory pack (screws, silicone)',
      reasonCategory: 'Short supply (quoted vs cutting list)',
      reason: 'Short supply (quoted vs cutting list) — Partial delivery vs quote',
      amountNgn: 45000,
      calculationLines: [{ label: 'Undelivered accessories (per quote line)', amountNgn: 45000 }],
      calculationNotes: '',
      status: 'Approved',
      approvalDate: '2026-03-27',
      managerComments: 'Approved — pay customer; document GRN short on next stock take.',
      requestedBy: 'Mary Okafor',
      requestedAtISO: '2026-03-26T14:00:00.000Z',
      approvedBy: 'Sales Manager (demo)',
      paidAtISO: '',
      paidBy: '',
    },
  ],
};

/**
 * Customer dashboard — orders, interactions, sales trend (demo; replace with API).
 * @typedef {{ id: string, customerID: string, date: string, dateISO: string, lines: { product: string, qty: number, unit: string }[], totalNgn: number, status: 'Pending'|'Shipped'|'Delivered', quotationRef: string }} CustomerOrder
 * @typedef {{ id: string, customerID: string, kind: 'email'|'call'|'meeting'|'inquiry'|'complaint'|'note', title: string, detail: string, dateISO: string }} CustomerInteraction
 */
export const CUSTOMER_DASHBOARD_MOCK = {
  orders: [
    {
      id: 'ORD-2026-018',
      customerID: 'CUS-001',
      date: '27 Mar 2026',
      dateISO: '2026-03-27',
      lines: [
        { product: 'Longspan 0.45mm HM Blue', qty: 180, unit: 'm' },
        { product: 'Ridge caps & screws kit', qty: 2, unit: 'set' },
      ],
      totalNgn: 890000,
      status: 'Shipped',
      quotationRef: 'QT-2026-001',
    },
    {
      id: 'ORD-2026-012',
      customerID: 'CUS-001',
      date: '16 Mar 2026',
      dateISO: '2026-03-16',
      lines: [{ product: 'Accessories & silicone', qty: 40, unit: 'unit' }],
      totalNgn: 320000,
      status: 'Delivered',
      quotationRef: 'QT-2026-005',
    },
    {
      id: 'ORD-2026-009',
      customerID: 'CUS-002',
      date: '26 Mar 2026',
      dateISO: '2026-03-26',
      lines: [{ product: 'Traffic Black longspan 0.24mm', qty: 95, unit: 'm' }],
      totalNgn: 650000,
      status: 'Pending',
      quotationRef: 'QT-2026-002',
    },
    {
      id: 'ORD-2026-006',
      customerID: 'CUS-004',
      date: '25 Mar 2026',
      dateISO: '2026-03-25',
      lines: [{ product: 'Mixed coil dispatch', qty: 1, unit: 'lot' }],
      totalNgn: 2100000,
      status: 'Delivered',
      quotationRef: 'QT-2026-003',
    },
    {
      id: 'ORD-2026-004',
      customerID: 'CUS-003',
      date: '24 Mar 2026',
      dateISO: '2026-03-24',
      lines: [{ product: 'Aluzinc 0.30mm sheets', qty: 200, unit: 'm' }],
      totalNgn: 620000,
      status: 'Pending',
      quotationRef: 'QT-2026-004',
    },
    {
      id: 'ORD-2026-003',
      customerID: 'CUS-002',
      date: '11 Mar 2026',
      dateISO: '2026-03-11',
      lines: [{ product: 'HM Blue flashings', qty: 60, unit: 'm' }],
      totalNgn: 410000,
      status: 'Delivered',
      quotationRef: 'QT-2026-007',
    },
  ],
  interactions: [
    {
      id: 'INT-101',
      customerID: 'CUS-001',
      kind: 'call',
      title: 'Follow-up on partial payment',
      detail: 'Customer confirmed bank transfer for ₦400k; balance before dispatch.',
      dateISO: '2026-03-28T09:30:00',
    },
    {
      id: 'INT-102',
      customerID: 'CUS-001',
      kind: 'email',
      title: 'Quotation QT-2026-001 sent',
      detail: 'PDF sent to musa.roofing@example.com with Net 30 terms.',
      dateISO: '2026-03-27T14:00:00',
    },
    {
      id: 'INT-103',
      customerID: 'CUS-002',
      kind: 'meeting',
      title: 'Site visit — Jos Liberty',
      detail: 'Measured roof; agreed on Traffic Black gauge.',
      dateISO: '2026-03-25T11:00:00',
    },
    {
      id: 'INT-104',
      customerID: 'CUS-002',
      kind: 'inquiry',
      title: 'Lead time question',
      detail: 'Asked about 2-week delivery window for approved QT.',
      dateISO: '2026-03-26T16:20:00',
    },
    {
      id: 'INT-105',
      customerID: 'CUS-003',
      kind: 'complaint',
      title: 'Delivery slot',
      detail: 'Requested earlier loading; logged for dispatch team.',
      dateISO: '2026-03-23T10:15:00',
    },
    {
      id: 'INT-106',
      customerID: 'CUS-004',
      kind: 'call',
      title: 'Sokoto depot pickup',
      detail: 'Confirmed full payment and pickup window.',
      dateISO: '2026-03-25T08:00:00',
    },
  ],
  /** Last 6 months NGN totals per customer for trend chart */
  salesTrendByCustomer: {
    'CUS-001': [
      { month: 'Oct', amountNgn: 1_100_000 },
      { month: 'Nov', amountNgn: 1_450_000 },
      { month: 'Dec', amountNgn: 980_000 },
      { month: 'Jan', amountNgn: 1_720_000 },
      { month: 'Feb', amountNgn: 2_100_000 },
      { month: 'Mar', amountNgn: 2_650_000 },
    ],
    'CUS-002': [
      { month: 'Oct', amountNgn: 220_000 },
      { month: 'Nov', amountNgn: 380_000 },
      { month: 'Dec', amountNgn: 290_000 },
      { month: 'Jan', amountNgn: 410_000 },
      { month: 'Feb', amountNgn: 350_000 },
      { month: 'Mar', amountNgn: 890_000 },
    ],
    'CUS-003': [
      { month: 'Oct', amountNgn: 0 },
      { month: 'Nov', amountNgn: 180_000 },
      { month: 'Dec', amountNgn: 240_000 },
      { month: 'Jan', amountNgn: 310_000 },
      { month: 'Feb', amountNgn: 400_000 },
      { month: 'Mar', amountNgn: 620_000 },
    ],
    'CUS-004': [
      { month: 'Oct', amountNgn: 1_800_000 },
      { month: 'Nov', amountNgn: 2_200_000 },
      { month: 'Dec', amountNgn: 1_950_000 },
      { month: 'Jan', amountNgn: 2_400_000 },
      { month: 'Feb', amountNgn: 2_050_000 },
      { month: 'Mar', amountNgn: 3_080_000 },
    ],
  },
};

/** Suppliers for PO / stock receipt forms. */
export const SUPPLIERS_MOCK = [
  {
    supplierID: 'SUP-001',
    name: 'Alumaco Global',
    city: 'Kano',
    paymentTerms: 'Credit',
    qualityScore: 92,
    notes: 'Primary northern coil source — competitive on heavy gauges.',
  },
  {
    supplierID: 'SUP-002',
    name: 'Tower Aluminum',
    city: 'Lagos',
    paymentTerms: 'Advance',
    qualityScore: 88,
    notes: 'South-west logistics; strong on thin aluzinc.',
  },
  {
    supplierID: 'SUP-003',
    name: 'MetalMark West Africa',
    city: 'Abuja',
    paymentTerms: 'Credit',
    qualityScore: 85,
    notes: 'FCA Abuja — useful for mixed routes.',
  },
];

/**
 * Coil purchase catalogue: supplier offers list style (colour, gauge, kg, m, conversion).
 * Reference rows; coil purchases use material (Aluminium → COIL-ALU, Aluzinc (PPGI) → PRD-102). Stone-coated uses metre SKUs (STONE-*). conversionKgPerM = kg ÷ m.
 */
export const PROCUREMENT_COIL_CATALOG = [
  {
    id: 'CAT-001',
    color: 'IV',
    gauge: '0.24',
    productID: 'COIL-ALU',
    offerKg: 3200,
    offerMeters: 1208,
    conversionKgPerM: 2.65,
    label: 'IV 0.24 — aluminium',
  },
  {
    id: 'CAT-002',
    color: 'GB',
    gauge: '0.28',
    productID: 'PRD-102',
    offerKg: 4100,
    offerMeters: 1550,
    conversionKgPerM: 2.65,
    label: 'GB 0.28 — aluzinc',
  },
  {
    id: 'CAT-003',
    color: 'HMB',
    gauge: '0.22',
    productID: 'COIL-ALU',
    offerKg: 2800,
    offerMeters: 1186,
    conversionKgPerM: 2.36,
    label: 'HMB 0.22 — aluminium',
  },
  {
    id: 'CAT-004',
    color: 'TB',
    gauge: '0.30',
    productID: 'COIL-ALU',
    offerKg: 3600,
    offerMeters: 1200,
    conversionKgPerM: 3.0,
    label: 'TB 0.30 — aluminium',
  },
];

/** If measured kg/m exceeds standard by this ratio, flag conversion (demo). */
export const CONVERSION_FLAG_RATIO = 1.08;

/**
 * Stock catalog (Operations — stock entry / adjustment / low stock).
 * @typedef {{ productID: string, name: string, stockLevel: number, unit: string, lowStockThreshold: number, reorderQty: number, dashboardAttrs?: { gauge: string, colour: string, materialType: string } }} InvProduct
 */
export const INVENTORY_PRODUCTS_MOCK = [
  {
    productID: 'COIL-ALU',
    name: 'Aluminium coil (kg)',
    stockLevel: heavyCoilKg,
    unit: 'kg',
    lowStockThreshold: 10000,
    reorderQty: 20000,
    dashboardAttrs: {
      gauge: 'Per PO / coil',
      colour: 'Per PO / coil (HMB, GB, TB, …)',
      materialType: 'Aluminium',
    },
  },
  {
    productID: 'PRD-102',
    name: 'Aluzinc (PPGI) coil (kg)',
    stockLevel: aluzinc028Kg,
    unit: 'kg',
    lowStockThreshold: 15000,
    reorderQty: 20000,
    dashboardAttrs: {
      gauge: 'Per PO / coil',
      colour: 'Per PO / coil',
      materialType: 'Aluzinc (PPGI)',
    },
  },
  {
    productID: 'STONE-milano-black-0.40mm',
    name: 'Stone coated Milano / Black / 0.40mm',
    stockLevel: 0,
    unit: 'm',
    lowStockThreshold: 100,
    reorderQty: 500,
    dashboardAttrs: {
      gauge: '0.40mm',
      colour: 'Black',
      materialType: 'Stone coated',
      inventoryModel: 'stone_meter',
      stoneDesign: 'Milano',
    },
  },
  {
    productID: 'PRD-201',
    name: 'Tapping screws (carton)',
    stockLevel: tappingScrewCartons,
    unit: 'box',
    lowStockThreshold: 200,
    reorderQty: 500,
    dashboardAttrs: {
      gauge: '—',
      colour: '—',
      materialType: 'Accessory (fasteners)',
    },
  },
  {
    productID: 'FG-101',
    name: 'Longspan thin (0.18–0.24mm, IV·GB·HMB·TB) — opening ≈ yard register',
    stockLevel: longspanThinQty,
    unit: 'm',
    lowStockThreshold: 70000,
    reorderQty: 100000,
    dashboardAttrs: {
      gauge: '0.18–0.24',
      colour: 'IV · GB · HMB · TB · PR',
      materialType: 'Longspan (finished)',
    },
  },
];

/**
 * Purchase orders (Procurement → transport → Store GRN).
 * Status: Pending → Approved → On loading → In Transit → Received
 * @typedef {{ lineKey: string, productID: string, productName: string, color?: string, gauge?: string, metersOffered?: number|null, conversionKgPerM?: number|null, unitPricePerKgNgn?: number, qtyOrdered: number, unitPriceNgn: number, qtyReceived: number }} PoLine
 */
export const PURCHASE_ORDERS_MOCK = [
  {
    poID: 'PO-2026-001',
    supplierID: 'SUP-001',
    supplierName: 'Alumaco Global',
    orderDateISO: '2026-03-27',
    expectedDeliveryISO: '2026-04-02',
    status: 'In Transit',
    invoiceNo: 'INV-AG-8821',
    invoiceDateISO: '2026-03-28',
    deliveryDateISO: '',
    transportAgentId: 'AG-001',
    transportAgentName: 'Kano Haulage Co.',
    transportPaid: true,
    transportPaidAtISO: '2026-03-28T10:00:00',
    supplierPaidNgn: 5_000_000,
    lines: [
      {
        lineKey: 'L0-COIL-ALU',
        productID: 'COIL-ALU',
        productName: 'Aluminium coil (kg)',
        color: 'IV',
        gauge: '0.24',
        metersOffered: 1208,
        conversionKgPerM: 2.65,
        unitPricePerKgNgn: 1850,
        qtyOrdered: 4000,
        unitPriceNgn: 1850,
        qtyReceived: 0,
      },
    ],
  },
  {
    poID: 'PO-2026-002',
    supplierID: 'SUP-002',
    supplierName: 'Tower Aluminum',
    orderDateISO: '2026-03-26',
    expectedDeliveryISO: '2026-03-29',
    status: 'On loading',
    invoiceNo: '',
    invoiceDateISO: '',
    deliveryDateISO: '',
    transportAgentId: 'AG-002',
    transportAgentName: 'Lagos Freight Ltd.',
    transportPaid: false,
    transportPaidAtISO: '',
    supplierPaidNgn: 2_000_000,
    lines: [
      {
        lineKey: 'L0-PRD-102',
        productID: 'PRD-102',
        productName: 'Aluzinc (PPGI) coil (kg)',
        color: 'GB',
        gauge: '0.28',
        metersOffered: 1550,
        conversionKgPerM: 2.65,
        unitPricePerKgNgn: 2100,
        qtyOrdered: 2500,
        unitPriceNgn: 2100,
        qtyReceived: 0,
      },
    ],
  },
];

/** Operational expenses (Accounts → Expenses). */
export const EXPENSES_MOCK = [
  {
    expenseID: 'EXP-2026-014',
    expenseType: 'Materials',
    amountNgn: 185000,
    date: '2026-03-26',
    category: 'Plant consumables',
    paymentMethod: 'Bank Transfer',
    reference: 'INV-TXN-8821',
  },
  {
    expenseID: 'EXP-2026-013',
    expenseType: 'Utilities',
    amountNgn: 92000,
    date: '2026-03-25',
    category: 'PHCN / diesel top-up',
    paymentMethod: 'Cash',
    reference: 'RCPT-441',
  },
];

/** Payment requests linked to expenses. */
export const PAYMENT_REQUESTS_MOCK = [
  {
    requestID: 'PREQ-2026-003',
    expenseID: 'EXP-2026-014',
    amountRequestedNgn: 185000,
    requestDate: '2026-03-27',
    approvalStatus: 'Pending',
    description: 'Pay supplier invoice for consumables',
  },
  {
    requestID: 'PREQ-2026-002',
    expenseID: 'EXP-2026-013',
    amountRequestedNgn: 92000,
    requestDate: '2026-03-26',
    approvalStatus: 'Approved',
    description: 'Utilities settlement',
  },
];

/**
 * Supplier invoices / accounts payable (demo — link to Procurement POs).
 * @typedef {{ apID: string, supplierName: string, poRef: string, invoiceRef: string, amountNgn: number, paidNgn: number, dueDateISO: string, paymentMethod?: string }} AccountsPayableRow
 */
export const ACCOUNTS_PAYABLE_MOCK = [
  {
    apID: 'AP-2026-004',
    supplierName: 'Alumaco Global',
    poRef: 'PO-2026-001',
    invoiceRef: 'INV-AG-8821',
    amountNgn: 14_500_000,
    paidNgn: 5_000_000,
    dueDateISO: '2026-04-05',
  },
  {
    apID: 'AP-2026-003',
    supplierName: 'Tower Aluminum',
    poRef: 'PO-2026-002',
    invoiceRef: 'INV-TA-4410',
    amountNgn: 8_800_000,
    paidNgn: 8_800_000,
    dueDateISO: '2026-03-20',
  },
  {
    apID: 'AP-2026-002',
    supplierName: 'MetalMark West Africa',
    poRef: 'PO-2026-003',
    invoiceRef: 'INV-MM-2201',
    amountNgn: 3_250_000,
    paidNgn: 1_000_000,
    dueDateISO: '2026-03-25',
  },
];

/**
 * Bank statement lines vs ledger (reconciliation demo).
 * @typedef {{ id: string, bankDateISO: string, description: string, amountNgn: number, systemMatch: string | null, status: 'Matched' | 'Review' }} ReconciliationLine
 */
export const BANK_RECONCILIATION_MOCK = [
  {
    id: 'BR-001',
    bankDateISO: '2026-03-27',
    description: 'NIP / ZAREWA ROOFING — QT collections',
    amountNgn: 2_450_000,
    systemMatch: 'Batch receipts (Sales)',
    status: 'Matched',
  },
  {
    id: 'BR-002',
    bankDateISO: '2026-03-27',
    description: 'POS SETTLEMENT — GTB',
    amountNgn: 890_000,
    systemMatch: 'RC-2026-013',
    status: 'Matched',
  },
  {
    id: 'BR-003',
    bankDateISO: '2026-03-26',
    description: 'OUTWARD TRANSFER — ALUMACO',
    amountNgn: -5_000_000,
    systemMatch: 'AP-2026-004 partial',
    status: 'Matched',
  },
  {
    id: 'BR-004',
    bankDateISO: '2026-03-26',
    description: 'UNKNOWN CHARGES — SMS ALERT',
    amountNgn: -4_500,
    systemMatch: null,
    status: 'Review',
  },
];

/** Quotations whose dateISO falls in [startISO, endISO] (inclusive). Rows without dateISO are included. */
export function quotationsInDateRange(quotations, startISO, endISO) {
  if (!startISO || !endISO) return quotations;
  return quotations.filter((q) => {
    if (!q.dateISO) return true;
    return q.dateISO >= startISO && q.dateISO <= endISO;
  });
}

/** Sum of unpaid quotation balances (AR) from mock sales data. */
export function totalAccountsReceivableNgn(quotations) {
  return quotations.reduce((s, q) => {
    if (q.paymentStatus === 'Paid') return s;
    return s + (q.totalNgn - (q.paidNgn || 0));
  }, 0);
}

/**
 * Legacy demo constants only — the live Operations dashboard uses the workspace snapshot and
 * `src/lib/liveAnalytics.js` instead. Kept for older fixtures or imports; do not wire new UI here.
 */
export const DASHBOARD_SNAPSHOT = {
  salesTodayNgn: 2_450_000,
  salesMonthNgn: 28_400_000,
  cashBalanceNgn: 2_800_000,
  bankBalanceNgn: 19_450_000,
  pendingReceiptsCount: 4,
  pendingCollectionsNgn: 3_050_000,
  lowStockCount: 3,
  overdueInvoicesCount: 2,
  deliveriesDueSoon: 2,
  /** Last 7 days revenue (NGN) for spark trend */
  salesByDay: [
    { day: 'Mon', amount: 1_220_000 },
    { day: 'Tue', amount: 1_890_000 },
    { day: 'Wed', amount: 980_000 },
    { day: 'Thu', amount: 2_100_000 },
    { day: 'Fri', amount: 2_450_000 },
    { day: 'Sat', amount: 1_650_000 },
    { day: 'Sun', amount: 890_000 },
  ],
  /** Stock mix (relative scale — longspan in 000s sheets, metals in tonnes approx.) */
  stockMix: [
    { name: 'Longspan thin', value: Math.round(longspanThinQty / 1000) },
    { name: 'Aluzinc 0.28 mm', value: Math.round(aluzinc028Kg / 1000) },
    { name: 'Heavy coil', value: Math.round(heavyCoilKg / 1000) },
    { name: 'Consumables', value: 3 },
  ],
  /** Millions NGN for compact axis */
  cashflowMonthly: [
    { month: 'Oct', income: 16.2, expense: 10.4 },
    { month: 'Nov', income: 18.1, expense: 11.2 },
    { month: 'Dec', income: 22.4, expense: 12.8 },
    { month: 'Jan', income: 19.5, expense: 11.9 },
    { month: 'Feb', income: 24.3, expense: 13.1 },
    { month: 'Mar', income: 28.4, expense: 14.5 },
  ],
};

/** Metres produced (completed production basis) — demo monthly series for charts. */
export const DASHBOARD_METERS_SOLD_MONTHLY = [
  { key: '2025-10', label: 'Oct 2025', meters: 58_200 },
  { key: '2025-11', label: 'Nov 2025', meters: 64_100 },
  { key: '2025-12', label: 'Dec 2025', meters: 71_400 },
  { key: '2026-01', label: 'Jan 2026', meters: 66_800 },
  { key: '2026-02', label: 'Feb 2026', meters: 69_500 },
  { key: '2026-03', label: 'Mar 2026', meters: 58_800 },
];

/** Revenue trend by week (NGN) — dashboard chart. */
export const DASHBOARD_SALES_BY_WEEK = [
  { period: 'W1 Mar', amountNgn: 6_200_000 },
  { period: 'W2 Mar', amountNgn: 7_050_000 },
  { period: 'W3 Mar', amountNgn: 6_480_000 },
  { period: 'W4 Mar', amountNgn: 8_670_000 },
];

/** Revenue trend by month (NGN) — dashboard chart. */
export const DASHBOARD_SALES_BY_MONTH = [
  { period: 'Oct', amountNgn: 18_200_000 },
  { period: 'Nov', amountNgn: 19_800_000 },
  { period: 'Dec', amountNgn: 22_100_000 },
  { period: 'Jan', amountNgn: 20_400_000 },
  { period: 'Feb', amountNgn: 24_300_000 },
  { period: 'Mar', amountNgn: 28_400_000 },
];

/** Cash + bank lines (sums to treasury view; align with Finance demo accounts). */
export const DASHBOARD_LIQUIDITY_BREAKDOWN = [
  { label: 'Cash office (till)', amountNgn: 2_800_000 },
  { label: 'GTBank Main', amountNgn: 14_250_000 },
  { label: 'Zenith Production', amountNgn: 5_200_000 },
];

export function dashboardTotalLiquidityNgn() {
  return DASHBOARD_LIQUIDITY_BREAKDOWN.reduce((s, a) => s + a.amountNgn, 0);
}

/** Rolling production pulse (replace with MES / dispatch API). */
export const DASHBOARD_PRODUCTION_PULSE = {
  metresProduced7d: 4250,
  /** Metres corrugated at the mill (line output before full dispatch). */
  millOutput7d: 3980,
  activeJobs: 14,
};

/**
 * Top material performers by production (metres + attributed ₦) — demo per time window.
 * @typedef {{ rank: number, colour: string, gaugeMm: string, materialType: string, metresProduced: number, weightKg: number, revenueNgn: number }} TopCoilSalesRow
 */

export const DASHBOARD_TOP_COILS_PERIOD_ORDER = [
  { id: 'thisMonth', menuLabel: 'This month', rangeNote: 'Month to date' },
  { id: 'lastQuarter', menuLabel: 'Last quarter', rangeNote: 'Previous 3 full months' },
  { id: 'lastHalfYear', menuLabel: 'Last half year', rangeNote: 'Previous 6 months' },
  { id: 'lastYear', menuLabel: 'Past year', rangeNote: 'Rolling 12 months' },
];

export const DASHBOARD_TOP_COILS_SALES_BY_PERIOD = {
  thisMonth: [
    {
      rank: 1,
      colour: 'HMB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 15_420,
      weightKg: 41_634,
      revenueNgn: 68_200_000,
    },
    {
      rank: 2,
      colour: 'GB',
      gaugeMm: '0.28',
      materialType: 'Aluzinc longspan',
      metresProduced: 13_280,
      weightKg: 41_168,
      revenueNgn: 71_520_000,
    },
    {
      rank: 3,
      colour: 'IV',
      gaugeMm: '0.20',
      materialType: 'Aluzinc longspan',
      metresProduced: 11_950,
      weightKg: 26_290,
      revenueNgn: 47_800_000,
    },
    {
      rank: 4,
      colour: 'TB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 10_100,
      weightKg: 27_270,
      revenueNgn: 49_490_000,
    },
    {
      rank: 5,
      colour: 'NB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 8_640,
      weightKg: 23_328,
      revenueNgn: 42_336_000,
    },
  ],
  lastQuarter: [
    {
      rank: 1,
      colour: 'GB',
      gaugeMm: '0.28',
      materialType: 'Aluzinc longspan',
      metresProduced: 42_800,
      weightKg: 132_680,
      revenueNgn: 256_800_000,
    },
    {
      rank: 2,
      colour: 'HMB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 39_600,
      weightKg: 106_920,
      revenueNgn: 194_040_000,
    },
    {
      rank: 3,
      colour: 'IV',
      gaugeMm: '0.20',
      materialType: 'Aluzinc longspan',
      metresProduced: 33_400,
      weightKg: 73_480,
      revenueNgn: 133_600_000,
    },
    {
      rank: 4,
      colour: 'TB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 30_200,
      weightKg: 81_540,
      revenueNgn: 147_980_000,
    },
    {
      rank: 5,
      colour: 'PR',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 26_100,
      weightKg: 70_470,
      revenueNgn: 127_890_000,
    },
  ],
  lastHalfYear: [
    {
      rank: 1,
      colour: 'GB',
      gaugeMm: '0.28',
      materialType: 'Aluzinc longspan',
      metresProduced: 88_200,
      weightKg: 273_420,
      revenueNgn: 529_200_000,
    },
    {
      rank: 2,
      colour: 'IV',
      gaugeMm: '0.20',
      materialType: 'Aluzinc longspan',
      metresProduced: 76_400,
      weightKg: 168_080,
      revenueNgn: 305_600_000,
    },
    {
      rank: 3,
      colour: 'HMB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 71_900,
      weightKg: 194_130,
      revenueNgn: 352_310_000,
    },
    {
      rank: 4,
      colour: 'TB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 64_500,
      weightKg: 174_150,
      revenueNgn: 316_050_000,
    },
    {
      rank: 5,
      colour: 'BG',
      gaugeMm: '0.22',
      materialType: 'Aluzinc longspan',
      metresProduced: 58_200,
      weightKg: 151_320,
      revenueNgn: 261_900_000,
    },
  ],
  lastYear: [
    {
      rank: 1,
      colour: 'IV',
      gaugeMm: '0.20',
      materialType: 'Aluzinc longspan',
      metresProduced: 168_000,
      weightKg: 369_600,
      revenueNgn: 672_000_000,
    },
    {
      rank: 2,
      colour: 'GB',
      gaugeMm: '0.28',
      materialType: 'Aluzinc longspan',
      metresProduced: 155_400,
      weightKg: 481_740,
      revenueNgn: 932_400_000,
    },
    {
      rank: 3,
      colour: 'HMB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 142_800,
      weightKg: 385_560,
      revenueNgn: 699_720_000,
    },
    {
      rank: 4,
      colour: 'TB',
      gaugeMm: '0.24',
      materialType: 'Aluzinc longspan',
      metresProduced: 128_600,
      weightKg: 347_220,
      revenueNgn: 630_140_000,
    },
    {
      rank: 5,
      colour: 'PR',
      gaugeMm: '0.20',
      materialType: 'Aluzinc longspan',
      metresProduced: 115_200,
      weightKg: 253_440,
      revenueNgn: 460_800_000,
    },
  ],
};

export const DASHBOARD_ALERTS = [
  {
    id: 'alt-stock',
    type: 'stock',
    severity: 'warning',
    title: 'Low stock',
    detail: '5 coil / SKU lines below minimum reorder',
    path: '/operations',
    hint: 'Review Production (store) & queue',
  },
  {
    id: 'alt-collect',
    type: 'payment',
    severity: 'danger',
    title: 'Outstanding collections',
    detail: 'Partial & unpaid quotations need follow-up',
    path: '/sales',
    state: { focusSalesTab: 'quotations' },
    hint: 'Open Sales → Quotations',
  },
  {
    id: 'alt-deliver',
    type: 'delivery',
    severity: 'info',
    title: 'Deliveries scheduled',
    detail: '2 shipments due within 48 hours',
    path: '/operations',
    state: { focusOpsTab: 'deliveries' },
    hint: 'Production → Deliveries tab',
  },
];
