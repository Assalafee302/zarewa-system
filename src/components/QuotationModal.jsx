import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  X,
  Search,
  Plus,
  Trash2,
  Printer,
  ChevronDown,
  Save,
  Calendar,
  UserPlus,
  Landmark,
  Wallet,
} from 'lucide-react';
import { ModalFrame } from './layout/ModalFrame';
import { useCustomers } from '../context/CustomersContext';
import { bankAccountsForCustomerPayment, treasuryAccountsFromSnapshot } from '../lib/treasuryAccountsStore';
import { ZAREWA_COMPANY_ACCOUNT_NAME } from '../Data/companyQuotation';
import { formatNgn } from '../Data/mockData';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  advanceBalanceNgn,
  amountDueOnQuotation,
  recordAdvanceAppliedToQuotation,
} from '../lib/customerLedgerStore';
import { apiFetch } from '../lib/apiBase';
import { guidanceForLedgerPostFailure, isVoucherDateInLockedPeriod } from '../lib/ledgerPostingGuidance';
import { EditSecondApprovalInline } from './EditSecondApprovalInline';
import QuotationPrintView from './QuotationPrintView';

const DEFAULT_PROFILES = ['Longspan (Indus6)', 'Metrotile', 'Steptile', 'Capping', 'Ridge Cap'];
const DEFAULT_GAUGES = ['0.70mm', '0.55mm', '0.45mm', '0.40mm', '0.30mm', '0.24mm'];
const DEFAULT_COLOURS = ['HM Blue', 'Traffic Black', 'TC Red', 'Bush Green', 'Zinc Grey'];
const DEFAULT_PRODUCT_ITEMS = ['Roofing Sheet', 'Capping', 'Ridge Cap', 'Gutter'];
const DEFAULT_ACCESSORY_ITEMS = ['Tapping Screw', 'Silicon Tube', 'Rivets', 'Bitumen Tape'];
const DEFAULT_SERVICE_ITEMS = ['Installation', 'Transportation', 'Labor Charge'];

const QUOTATION_EDIT_TYPES = [
  'Correction (typo / clerical)',
  'Customer / billing change',
  'Line items or pricing',
  'Terms, dates, or delivery',
  'Other',
];

function formatDisplayDate(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function newLineId() {
  return `L${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyOrderLine() {
  return { id: newLineId(), name: '', qty: '', unitPrice: '' };
}

function parseLineNum(s) {
  const n = Number(String(s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function lineAmountNgn(row) {
  return parseLineNum(row.qty) * parseLineNum(row.unitPrice);
}

/** @param {{ id: string; name: string; qty: string; unitPrice: string }[]} rows */
function sumRowsNgn(rows) {
  return rows.reduce((s, r) => s + lineAmountNgn(r), 0);
}

/** @param {unknown} raw */
function normalizeLoadedLines(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw.products;
  const a = raw.accessories;
  const s = raw.services;
  if (!Array.isArray(p) || !Array.isArray(a) || !Array.isArray(s)) return null;
  const mapRow = (r) => ({
    id: r.id && String(r.id),
    name: String(r.name ?? ''),
    qty: r.qty != null ? String(r.qty) : '',
    unitPrice: r.unitPrice != null ? String(r.unitPrice) : '',
  });
  const withIds = (arr) =>
    arr.map((r) => {
      const x = mapRow(r);
      return { ...x, id: x.id || newLineId() };
    });
  return {
    products: withIds(p),
    accessories: withIds(a),
    services: withIds(s),
  };
}

function rowsForPrint(rows, placeholderWhenEmpty = true) {
  const filled = rows.filter((r) => String(r.name ?? '').trim());
  if (filled.length === 0) {
    return placeholderWhenEmpty ? [{ name: '—', qty: 0, unitPrice: 0, value: 0 }] : [];
  }
  return filled.map((r) => {
    const qty = parseLineNum(r.qty);
    const unitPrice = parseLineNum(r.unitPrice);
    const value = qty * unitPrice;
    return { name: String(r.name).trim(), qty, unitPrice, value };
  });
}

function normalizeOptionItems(optionItems) {
  return (optionItems || []).map((item) => {
    if (typeof item === 'string') {
      return {
        id: item,
        name: item,
        defaultUnitPriceNgn: 0,
      };
    }
    return {
      id: item.id || item.name,
      name: item.name || '',
      defaultUnitPriceNgn: Number(item.defaultUnitPriceNgn) || 0,
    };
  });
}

function OrderLinesSection({
  title,
  letter,
  optionItems,
  rows,
  setRows,
  readOnly,
  resolveUnitPrice,
}) {
  const addRow = () => setRows((prev) => [...prev, emptyOrderLine()]);
  const updateRow = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) =>
    setRows((prev) => (prev.length <= 1 ? [emptyOrderLine()] : prev.filter((r) => r.id !== id)));
  const normalizedOptions = normalizeOptionItems(optionItems);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-7 h-7 bg-[#134e4a] text-white rounded-lg flex items-center justify-center font-bold text-[10px]">
          {letter}
        </div>
        <h3 className="text-[10px] font-semibold text-[#134e4a] uppercase tracking-widest">{title}</h3>
      </div>

      <div className="bg-slate-50/80 rounded-xl p-3 sm:p-4 border border-slate-200/90">
        {readOnly ? (
          <ul className="space-y-2">
            {(rows.some((r) => r.name?.trim())
              ? rows.filter((r) => r.name?.trim())
              : []
            ).map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100/90 pb-2 text-xs last:border-0"
              >
                <span className="font-semibold text-[#134e4a]">{row.name?.trim() || '—'}</span>
                <span className="tabular-nums text-slate-600">
                  {row.qty || '0'} × {formatNgn(parseLineNum(row.unitPrice))} ={' '}
                  <span className="font-bold text-[#134e4a]">{formatNgn(lineAmountNgn(row))}</span>
                </span>
              </li>
            ))}
            {!rows.some((r) => r.name?.trim()) ? (
              <li className="text-xs text-slate-400 italic">No line items</li>
            ) : null}
          </ul>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-2 items-center mb-2 px-1 text-[8px] font-semibold text-slate-400 uppercase tracking-wider">
              <div className="col-span-12 sm:col-span-4">Item</div>
              <div className="col-span-4 sm:col-span-2 text-center">Qty</div>
              <div className="col-span-4 sm:col-span-2 text-center">Unit ₦</div>
              <div className="col-span-3 sm:col-span-2 text-right pr-1 sm:pr-2">Amount</div>
              <div className="col-span-1 sm:col-span-2 text-right"> </div>
            </div>

            {rows.map((row, idx) => {
              const isLast = idx === rows.length - 1;
              const amt = lineAmountNgn(row);
              const matchedOption =
                normalizedOptions.find((option) => option.name === row.name) || null;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-2 items-center mb-2 last:mb-0 border-b border-slate-100/80 pb-2 last:border-0 last:pb-0"
                >
                  <div className="col-span-12 sm:col-span-4 relative">
                    <select
                      value={matchedOption?.id || ''}
                      onChange={(e) => {
                        const option = normalizedOptions.find((item) => item.id === e.target.value);
                        const suggestedPrice =
                          typeof resolveUnitPrice === 'function'
                            ? resolveUnitPrice(option?.name || '', option || null)
                            : option?.defaultUnitPriceNgn || 0;
                        updateRow(row.id, {
                          name: option?.name || '',
                          unitPrice:
                            suggestedPrice > 0
                              ? String(suggestedPrice)
                              : option?.defaultUnitPriceNgn > 0
                                ? String(option.defaultUnitPriceNgn)
                                : row.unitPrice,
                        });
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-[#134e4a]/15 cursor-pointer"
                    >
                      <option value="">Choose or type below…</option>
                      {normalizedOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={matchedOption ? '' : row.name}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                      placeholder="Custom item name"
                      className="mt-1.5 w-full bg-white border border-dashed border-slate-200 rounded-lg py-1.5 px-2 text-[11px] text-slate-700 outline-none focus:ring-2 focus:ring-[#134e4a]/10"
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={row.qty}
                    onChange={(e) => updateRow(row.id, { qty: e.target.value })}
                    className="col-span-4 sm:col-span-2 bg-white border border-slate-200 p-2 rounded-lg text-xs text-center font-semibold text-[#134e4a] outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(row.id, { unitPrice: e.target.value })}
                    className="col-span-4 sm:col-span-2 bg-white border border-slate-200 p-2 rounded-lg text-xs text-center font-semibold text-[#134e4a] outline-none tabular-nums"
                  />
                  <div className="col-span-3 sm:col-span-2 text-right pr-1 sm:pr-2 text-xs font-bold text-[#134e4a] tabular-nums">
                    {formatNgn(amt)}
                  </div>
                  <div className="col-span-5 sm:col-span-2 flex justify-end items-center gap-1">
                    <button
                      type="button"
                      title="Remove line"
                      onClick={() => removeRow(row.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    {isLast ? (
                      <button
                        type="button"
                        title={`Add ${title.endsWith('s') ? title.slice(0, -1) : title}`}
                        onClick={addRow}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#134e4a]/25 bg-teal-50/80 text-[#134e4a] hover:bg-teal-100 transition-colors"
                      >
                        <Plus size={16} strokeWidth={2.5} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {'view' | 'edit'} [props.accessMode]
 * @param {string} [props.quotedByStaff] — workspace staff label for new quotations (print + audit)
 * @param {boolean} [props.useQuotationApi] — persist create/update to SQLite via POST/PATCH /api/quotations
 * @param {(quotation: object) => void} [props.onQuotationRevived] — after POST /api/quotations/:id/revive
 */
const QuotationModal = ({
  isOpen,
  onClose,
  editData,
  accessMode = 'edit',
  onLedgerChange,
  onQuotationRevived,
  useLedgerApi = false,
  useQuotationApi = false,
  quotedByStaff = 'Sales',
}) => {
  const navigate = useNavigate();
  const { customers } = useCustomers();
  const { show: showToast } = useToast();
  const ws = useWorkspace();
  const archivedLifecycle =
    Boolean(editData?.id) && ['Expired', 'Void'].includes(String(editData?.status || '').trim());
  const readOnly = accessMode === 'view' || archivedLifecycle;

  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerListOpen, setCustomerListOpen] = useState(false);
  const customerBlurTimer = useRef(null);

  const [productRows, setProductRows] = useState(() => [emptyOrderLine()]);
  const [accessoryRows, setAccessoryRows] = useState(() => [emptyOrderLine()]);
  const [serviceRows, setServiceRows] = useState(() => [emptyOrderLine()]);

  const [quotationEditType, setQuotationEditType] = useState('');
  const [treasuryPayAccounts, setTreasuryPayAccounts] = useState([]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [materialTypeId, setMaterialTypeId] = useState('');
  const [materialGauge, setMaterialGauge] = useState('');
  const [materialColor, setMaterialColor] = useState('');
  const [materialDesign, setMaterialDesign] = useState('');
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectName, setProjectName] = useState('');
  const [showPrint, setShowPrint] = useState(false);
  const [printDocumentKind, setPrintDocumentKind] = useState('quotation');
  const [applyAdvanceAmount, setApplyAdvanceAmount] = useState('');
  const [applyAdvanceHint, setApplyAdvanceHint] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [quotationEditApprovalId, setQuotationEditApprovalId] = useState('');
  const liveMasterData = ws?.snapshot?.masterData ?? null;

  const treasuryPayAccountsLive = useMemo(
    () => bankAccountsForCustomerPayment(treasuryAccountsFromSnapshot(ws?.snapshot)),
    [ws?.snapshot]
  );

  const materialTypeOptions = useMemo(() => {
    const rows = (liveMasterData?.materialTypes || []).filter((row) => row.active);
    return rows.map((row) => ({ value: row.id, label: row.name, inventoryModel: row.inventoryModel || '' }));
  }, [liveMasterData?.materialTypes]);

  /** Filter profiles by selected material type (stone vs coil). */
  const profileOptions = useMemo(() => {
    const fromMaster = (liveMasterData?.profiles || []).filter((row) => row.active);
    const filtered = materialTypeId
      ? fromMaster.filter((row) => String(row.materialTypeId || '').trim() === materialTypeId)
      : fromMaster;
    const opts = filtered.map((row) => ({ value: row.name, label: row.name }));
    if (opts.length > 0) return opts;
    return DEFAULT_PROFILES.map((name) => ({
      value: name,
      label: name,
    }));
  }, [liveMasterData?.profiles, materialTypeId]);

  const gaugeOptions = useMemo(() => {
    const fromMaster = (liveMasterData?.gauges || [])
      .filter((row) => row.active)
      .map((row) => ({ value: row.label, label: row.label, id: row.id }));
    if (fromMaster.length > 0) return fromMaster;
    return DEFAULT_GAUGES.map((label) => ({
      value: label,
      label,
      id: undefined,
    }));
  }, [liveMasterData?.gauges]);

  const colourOptions = useMemo(() => {
    const fromMaster = (liveMasterData?.colours || [])
      .filter((row) => row.active)
      .map((row) => ({
        value: row.name,
        label: row.abbreviation ? `${row.name} (${row.abbreviation})` : row.name,
        id: row.id,
      }));
    if (fromMaster.length > 0) return fromMaster;
    return DEFAULT_COLOURS.map((name) => ({
      value: name,
      label: name,
      id: undefined,
    }));
  }, [liveMasterData?.colours]);

  const quoteItemRowsActive = useMemo(
    () => (liveMasterData?.quoteItems || []).filter((row) => row.active),
    [liveMasterData?.quoteItems]
  );

  const mergeQuoteLineOptions = useCallback(
    (itemType, defaultNames) => {
      const fromMaster = quoteItemRowsActive
        .filter((row) => row.itemType === itemType)
        .map((row) => ({
          id: row.id,
          name: row.name,
          defaultUnitPriceNgn: row.defaultUnitPriceNgn,
        }));
      const seen = new Set(fromMaster.map((x) => x.name.trim().toLowerCase()));
      const slug = (s) =>
        String(s)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      const extras = defaultNames
        .filter((name) => !seen.has(name.trim().toLowerCase()))
        .map((name, idx) => ({
          id: `preset-${itemType}-${slug(name) || `n${idx}`}`,
          name,
          defaultUnitPriceNgn: 0,
        }));
      return [...fromMaster, ...extras];
    },
    [quoteItemRowsActive]
  );

  const productOptions = useMemo(() => {
    const fromMaster = mergeQuoteLineOptions('product', []);
    if (fromMaster.length > 0) return fromMaster;
    return mergeQuoteLineOptions('product', DEFAULT_PRODUCT_ITEMS);
  }, [mergeQuoteLineOptions]);
  const accessoryOptions = useMemo(() => {
    const fromMaster = mergeQuoteLineOptions('accessory', []);
    if (fromMaster.length > 0) return fromMaster;
    return mergeQuoteLineOptions('accessory', DEFAULT_ACCESSORY_ITEMS);
  }, [mergeQuoteLineOptions]);
  const serviceOptions = useMemo(() => {
    const fromMaster = mergeQuoteLineOptions('service', []);
    if (fromMaster.length > 0) return fromMaster;
    return mergeQuoteLineOptions('service', DEFAULT_SERVICE_ITEMS);
  }, [mergeQuoteLineOptions]);
  const priceListRows = useMemo(
    () => (liveMasterData?.priceList?.length ? liveMasterData.priceList.filter((row) => row.active) : []),
    [liveMasterData?.priceList]
  );
  const selectedGaugeMeta = useMemo(
    () => gaugeOptions.find((row) => row.value === materialGauge) || null,
    [gaugeOptions, materialGauge]
  );
  const selectedColourMeta = useMemo(
    () => colourOptions.find((row) => row.value === materialColor) || null,
    [colourOptions, materialColor]
  );
  const selectedProfileMeta = useMemo(
    () => liveMasterData?.profiles?.find((row) => row.name === materialDesign) || null,
    [liveMasterData?.profiles, materialDesign]
  );
  const selectedMaterialTypeMeta = useMemo(
    () => liveMasterData?.materialTypes?.find((row) => row.id === materialTypeId) || null,
    [liveMasterData?.materialTypes, materialTypeId]
  );

  const resolveUnitPrice = (itemName, option) => {
    const matches = priceListRows
      .filter((row) => {
        const sameItem =
          (option?.id && row.quoteItemId === option.id) ||
          String(row.itemName || '').trim().toLowerCase() === String(itemName || '').trim().toLowerCase();
        if (!sameItem) return false;
        if (row.gaugeId && row.gaugeId !== selectedGaugeMeta?.id) return false;
        if (row.colourId && row.colourId !== selectedColourMeta?.id) return false;
        if (row.profileId && row.profileId !== selectedProfileMeta?.id) return false;
        if (row.materialTypeId && row.materialTypeId !== selectedMaterialTypeMeta?.id) return false;
        return true;
      })
      .sort((a, b) => {
        const score = (row) =>
          [row.gaugeId, row.colourId, row.materialTypeId, row.profileId].filter(Boolean).length;
        return score(b) - score(a);
      });
    return matches[0]?.unitPriceNgn || option?.defaultUnitPriceNgn || 0;
  };

  useEffect(() => {
    if (!isOpen) return;
    setApplyAdvanceAmount('');
    setApplyAdvanceHint(null);
    const cid = editData?.customerID ?? '';
    setSelectedCustomerId(cid);
    const match = customers.find((x) => x.customerID === cid);
    setCustomerQuery(match ? `${match.name} · ${match.phoneNumber}` : '');
    setCustomerListOpen(false);
    setQuotationEditType('');
    const list = treasuryPayAccountsLive;
    setTreasuryPayAccounts(list);
    setPaymentAccountId((prev) => {
      const ok = list.some((a) => String(a.id) === String(prev));
      if (ok) return prev;
      return list[0] ? String(list[0].id) : '';
    });
    setQuoteDate(editData?.dateISO ?? new Date().toISOString().slice(0, 10));
    setMaterialTypeId(editData?.materialTypeId ?? '');
    setMaterialGauge(editData?.materialGauge ?? '');
    setMaterialColor(editData?.materialColor ?? '');
    setMaterialDesign(editData?.materialDesign ?? '');
    setProjectName(editData?.projectName ?? '');
    setShowPrint(false);

    const loaded = normalizeLoadedLines(editData?.quotationLines);
    if (loaded) {
      setProductRows(loaded.products.length ? loaded.products : [emptyOrderLine()]);
      setAccessoryRows(loaded.accessories.length ? loaded.accessories : [emptyOrderLine()]);
      setServiceRows(loaded.services.length ? loaded.services : [emptyOrderLine()]);
    } else {
      setProductRows([emptyOrderLine()]);
      setAccessoryRows([emptyOrderLine()]);
      setServiceRows([emptyOrderLine()]);
    }
  }, [
    isOpen,
    editData?.id,
    editData?.customerID,
    editData?.dateISO,
    customers,
    editData?.materialTypeId,
    editData?.materialGauge,
    editData?.materialColor,
    editData?.materialDesign,
    editData?.projectName,
    editData?.quotationLines,
    treasuryPayAccountsLive,
  ]);

  useEffect(() => {
    if (!materialDesign) return;
    const ok = profileOptions.some((p) => p.value === materialDesign);
    if (!ok) setMaterialDesign('');
  }, [materialTypeId, profileOptions, materialDesign]);

  useEffect(() => {
    return () => {
      if (customerBlurTimer.current) window.clearTimeout(customerBlurTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) setShowPrint(false);
  }, [isOpen]);

  const advanceBal = useMemo(
    () => advanceBalanceNgn(selectedCustomerId),
    [selectedCustomerId]
  );

  const quoteDueNgn = useMemo(() => {
    if (!editData?.id) return 0;
    return amountDueOnQuotation(editData);
  }, [editData]);

  const maxApplyAdvance = useMemo(
    () => Math.max(0, Math.min(advanceBal, quoteDueNgn)),
    [advanceBal, quoteDueNgn]
  );

  const applyAdvanceDateISO = useMemo(
    () => String(editData?.dateISO || new Date().toISOString().slice(0, 10)),
    [editData?.dateISO]
  );
  const periodLocks = ws?.snapshot?.periodLocks ?? [];
  const applyAdvanceDateLocked = useMemo(
    () => Boolean(useLedgerApi && isVoucherDateInLockedPeriod(applyAdvanceDateISO, periodLocks)),
    [useLedgerApi, applyAdvanceDateISO, periodLocks]
  );

  const submitApplyAdvance = async (e) => {
    e.preventDefault();
    if (!editData?.id || !selectedCustomerId) return;
    const n = Number(String(applyAdvanceAmount).replace(/,/g, ''));
    if (Number.isNaN(n) || n <= 0) {
      showToast('Enter amount to apply.', { variant: 'error' });
      return;
    }
    if (n > advanceBal) {
      showToast('Amount exceeds customer advance balance.', { variant: 'error' });
      return;
    }
    if (n > quoteDueNgn) {
      showToast('Amount exceeds remaining balance on this quotation.', { variant: 'error' });
      return;
    }
    if (useLedgerApi) {
      const { ok, data } = await apiFetch('/api/ledger/apply-advance', {
        method: 'POST',
        body: JSON.stringify({
          customerID: selectedCustomerId,
          customerName: selectedCustomer?.name ?? '',
          quotationRef: editData.id,
          amountNgn: n,
          dateISO: applyAdvanceDateISO,
        }),
      });
      if (!ok || !data?.ok) {
        setApplyAdvanceHint(guidanceForLedgerPostFailure(data) || null);
        showToast(data?.error || 'Could not apply advance.', { variant: 'error' });
        return;
      }
      setApplyAdvanceHint(null);
    } else {
      const res = recordAdvanceAppliedToQuotation({
        customerID: selectedCustomerId,
        customerName: selectedCustomer?.name ?? '',
        quotationRef: editData.id,
        amountNgn: n,
      });
      if (!res.ok) {
        showToast(res.error, { variant: 'error' });
        return;
      }
    }
    showToast(`Applied ${formatNgn(n)} advance to ${editData.id}.`);
    setApplyAdvanceAmount('');
    await onLedgerChange?.();
  };

  const selectedCustomer =
    customers.find((x) => x.customerID === selectedCustomerId) ??
    (editData?.customer && editData?.customerID
      ? {
          customerID: editData.customerID,
          name: editData.customer,
          phoneNumber: '—',
        }
      : null);

  const selectedPayTreasuryAccount = useMemo(() => {
    const id = Number(paymentAccountId);
    return treasuryPayAccounts.find((a) => a.id === id) ?? null;
  }, [treasuryPayAccounts, paymentAccountId]);

  const payAccountForPrint = useMemo(() => {
    if (!selectedPayTreasuryAccount) return null;
    const bn = selectedPayTreasuryAccount.bankName?.trim();
    return {
      bankName: bn || selectedPayTreasuryAccount.name,
      accNo: selectedPayTreasuryAccount.accNo,
      accountName: ZAREWA_COMPANY_ACCOUNT_NAME,
    };
  }, [selectedPayTreasuryAccount]);

  const filteredCustomers = useMemo(() => {
    const raw = customerQuery.trim().toLowerCase();
    if (!raw) return customers.slice(0, 40);
    const digits = raw.replace(/\D/g, '');
    return customers.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const phone = String(c.phoneNumber || '').toLowerCase().replace(/\s/g, '');
      if (name.includes(raw)) return true;
      if (digits.length >= 3 && phone.replace(/\D/g, '').includes(digits)) return true;
      return phone.includes(raw.replace(/\s/g, ''));
    });
  }, [customers, customerQuery]);

  const grandTotalNgn = useMemo(
    () => sumRowsNgn(productRows) + sumRowsNgn(accessoryRows) + sumRowsNgn(serviceRows),
    [productRows, accessoryRows, serviceRows]
  );

  const quotationPaidNgn = Math.round(Number(editData?.paidNgn) || 0);
  const quotationBalanceAfterPaidNgn = Math.max(0, grandTotalNgn - quotationPaidNgn);

  const openPrintPreview = (kind) => {
    setPrintDocumentKind(kind);
    setShowPrint(true);
  };

  const printLinePayload = useMemo(
    () => ({
      products: rowsForPrint(productRows, true),
      accessories: rowsForPrint(accessoryRows, false),
      services: rowsForPrint(serviceRows, false),
    }),
    [productRows, accessoryRows, serviceRows]
  );

  const preparedByLabel = editData?.handledBy ?? quotedByStaff;

  const scheduleCustomerMenuClose = () => {
    if (customerBlurTimer.current) window.clearTimeout(customerBlurTimer.current);
    customerBlurTimer.current = window.setTimeout(() => setCustomerListOpen(false), 180);
  };

  const openFullCustomerForm = () => {
    onClose();
    navigate('/sales', { state: { focusSalesTab: 'customers', openCustomerCreate: true } });
  };

  const pickCustomer = (c) => {
    setSelectedCustomerId(c.customerID);
    setCustomerQuery(`${c.name} · ${c.phoneNumber}`);
    setCustomerListOpen(false);
  };

  const buildLinesPayload = () => ({
    products: productRows.map(({ id, name, qty, unitPrice }) => ({ id, name, qty, unitPrice })),
    accessories: accessoryRows.map(({ id, name, qty, unitPrice }) => ({ id, name, qty, unitPrice })),
    services: serviceRows.map(({ id, name, qty, unitPrice }) => ({ id, name, qty, unitPrice })),
  });

  const onSaveDraft = async () => {
    if (readOnly) return;
    if (!selectedCustomer?.customerID) {
      showToast('Select a customer before saving.', { variant: 'error' });
      return;
    }
    if (useQuotationApi) {
      setSaving(true);
      try {
        const body = {
          customerID: selectedCustomer.customerID,
          projectName: projectName.trim(),
          dateISO: quoteDate,
          lines: buildLinesPayload(),
          materialTypeId,
          materialGauge,
          materialColor,
          materialDesign,
          handledBy: preparedByLabel,
          status: editData?.status || 'Pending',
          paidNgn: editData?.paidNgn ?? 0,
          paymentStatus: editData?.paymentStatus,
          customerFeedback: editData?.customerFeedback,
          approvalDate: editData?.approvalDate,
        };
        if (editData?.id) {
          const { ok, data } = await apiFetch(`/api/quotations/${encodeURIComponent(editData.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...body,
              ...(quotationEditApprovalId ? { editApprovalId: quotationEditApprovalId.trim() } : {}),
            }),
          });
          if (!ok || !data?.ok) {
            showToast(data?.error || 'Could not update quotation.', { variant: 'error' });
            return;
          }
          setQuotationEditApprovalId('');
          showToast(`Quotation ${editData.id} saved to database.`);
        } else {
          const { ok, data } = await apiFetch('/api/quotations', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          if (!ok || !data?.ok) {
            showToast(data?.error || 'Could not create quotation.', { variant: 'error' });
            return;
          }
          showToast(`Quotation ${data.quotationId} created.`);
        }
        await onLedgerChange?.();
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }
    showToast(
      `Quotation not saved to the database. Start the API server to persist this record (${preparedByLabel}).`,
      { variant: 'error' }
    );
  };

  const onReviveArchived = async () => {
    if (!editData?.id || !useQuotationApi || !ws?.canMutate) return;
    setReviving(true);
    try {
      const { ok, data } = await apiFetch(`/api/quotations/${encodeURIComponent(editData.id)}/revive`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!ok || !data?.ok) {
        showToast(data?.error || 'Could not revive quotation.', { variant: 'error' });
        return;
      }
      showToast(`Quotation ${editData.id} revived — back in the active pipeline as Pending.`);
      await onLedgerChange?.();
      if (typeof ws?.refresh === 'function') await ws.refresh();
      if (data.quotation && typeof onQuotationRevived === 'function') onQuotationRevived(data.quotation);
    } finally {
      setReviving(false);
    }
  };

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose} modal={!showPrint}>
      <div className="z-modal-panel max-w-[min(100%,210mm)] w-full max-h-[min(92vh,820px)] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center shrink-0 bg-white gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-[#134e4a] rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
              Q
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h2 className="text-base font-bold text-[#134e4a] tracking-tight">Quotation</h2>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    readOnly
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-teal-100 text-[#134e4a] ring-1 ring-[#134e4a]/20'
                  }`}
                >
                  {readOnly ? 'View' : 'Edit'}
                </span>
              </div>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest truncate mt-0.5">
                {editData?.id ? `${editData.id}` : 'New quote'}
                {readOnly ? ' · read-only' : editData?.id ? ' · amending' : ''}
              </p>
              <p className="text-[9px] font-medium text-slate-500 mt-1">
                Prepared by: <span className="font-semibold text-[#134e4a]">{preparedByLabel}</span>
                {!editData?.id ? <span className="text-slate-400"> · current workspace role</span> : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-xl transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-white">
          {archivedLifecycle ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 space-y-2">
              <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                Archived quotation ({String(editData.status)})
              </p>
              <p className="text-[10px] text-amber-950/90 leading-snug">
                {editData.lifecycleNote
                  ? String(editData.lifecycleNote)
                  : 'Valid for 10 days from quote date, or voided after a master price change. Revive to continue this record as Pending, or create a new quotation.'}
              </p>
              {useQuotationApi && ws?.canMutate && ws?.hasPermission?.('quotations.manage') ? (
                <button
                  type="button"
                  onClick={onReviveArchived}
                  disabled={reviving}
                  className="inline-flex items-center justify-center rounded-lg bg-[#134e4a] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-[#0f3d39] disabled:opacity-40"
                >
                  {reviving ? 'Reviving…' : 'Revive as Pending'}
                </button>
              ) : (
                <p className="text-[9px] text-amber-900/80">
                  Sign in with quotation edit permission to revive this record.
                </p>
              )}
            </div>
          ) : null}
          {readOnly ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-600">
              {archivedLifecycle
                ? 'Archived — use Revive above to unlock editing.'
                : 'View only — fields are locked. Editing may require branch manager approval when the quote is fully paid.'}
            </div>
          ) : null}

          {editData?.id ? (
            <div className="mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50/80">
              <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Quotation status
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">
                    Quotation ID
                  </label>
                  <input
                    readOnly
                    value={editData.id}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-semibold text-[#134e4a] opacity-90"
                  />
                </div>
                <div className="relative">
                  <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">
                    Status
                  </label>
                  <select
                    disabled={readOnly}
                    defaultValue={editData.status}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-semibold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-[#134e4a]/10 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 bottom-2.5 text-slate-300 pointer-events-none"
                  />
                </div>
                {!readOnly ? (
                  <div className="sm:col-span-2">
                    <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">
                      Edit type (why this change)
                    </label>
                    <select
                      value={quotationEditType}
                      onChange={(e) => setQuotationEditType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-[#134e4a]/10 cursor-pointer"
                    >
                      <option value="">Select edit type…</option>
                      {QUOTATION_EDIT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-slate-500 mt-1 leading-snug">
                      Audit trail — required when amending an existing quotation.
                    </p>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide ml-0.5 mb-1 block">
                    Customer feedback
                  </label>
                  <textarea
                    readOnly={readOnly}
                    rows={2}
                    defaultValue={editData.customerFeedback ?? ''}
                    placeholder="Notes…"
                    className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[#134e4a]/10 resize-none"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200/90 p-4 mb-5 bg-white">
            <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-2 block">
              Customer — search by name or phone
            </label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSelectedCustomerId('');
                  setCustomerListOpen(true);
                }}
                onFocus={() => {
                  if (readOnly) return;
                  if (customerBlurTimer.current) window.clearTimeout(customerBlurTimer.current);
                  setCustomerListOpen(true);
                }}
                onBlur={() => {
                  if (readOnly) return;
                  scheduleCustomerMenuClose();
                }}
                readOnly={readOnly}
                placeholder="Type name or phone — list updates as you type…"
                autoComplete="off"
                aria-expanded={customerListOpen}
                aria-controls="quotation-customer-suggestions"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#134e4a]/10"
              />
              {!readOnly && customerListOpen && filteredCustomers.length > 0 ? (
                <ul
                  id="quotation-customer-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {filteredCustomers.map((c) => (
                    <li key={c.customerID} role="option">
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-teal-50"
                        onClick={() => pickCustomer(c)}
                      >
                        <span className="font-semibold text-[#134e4a]">{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.phoneNumber}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {selectedCustomerId ? (
              <p className="mt-2 text-[10px] font-medium text-emerald-800">
                Selected: <span className="font-mono">{selectedCustomerId}</span>
              </p>
            ) : null}
            {!readOnly && customerQuery.trim().length >= 2 && filteredCustomers.length === 0 ? (
              <p className="mt-2 text-[10px] text-amber-700 font-medium">
                No match — use New customer to open the full registration form on the Customers tab.
              </p>
            ) : null}
            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={openFullCustomerForm}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#134e4a]/40 bg-teal-50/50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-[#134e4a] hover:bg-teal-50"
                >
                  <UserPlus size={14} />
                  New customer
                </button>
                <span className="text-[9px] text-slate-400">Opens Sales → Customers (full form)</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200/90 p-4 mb-5 bg-white">
            <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-2 block">
              Project name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              readOnly={readOnly}
              placeholder="e.g. Site address, estate, or job reference"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-xs font-semibold text-[#134e4a] outline-none focus:ring-2 focus:ring-[#134e4a]/10 disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="relative sm:col-span-3">
              <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                Material type
              </label>
              <select
                value={materialTypeId}
                onChange={(e) => setMaterialTypeId(e.target.value)}
                disabled={readOnly}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none disabled:opacity-60"
              >
                <option value="">Select material type…</option>
                {materialTypeOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 bottom-2.5 text-slate-300 pointer-events-none" />
            </div>
            <div className="relative sm:col-span-3">
              <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                Material gauge
              </label>
              <select
                value={materialGauge}
                onChange={(e) => setMaterialGauge(e.target.value)}
                disabled={readOnly}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none disabled:opacity-60"
              >
                <option value="">Select gauge…</option>
                {gaugeOptions.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 bottom-2.5 text-slate-300 pointer-events-none" />
            </div>
            <div className="relative">
              <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                Colour
              </label>
              <select
                value={materialColor}
                onChange={(e) => setMaterialColor(e.target.value)}
                disabled={readOnly}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none disabled:opacity-60"
              >
                <option value="">Select…</option>
                {colourOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 bottom-2.5 text-slate-300 pointer-events-none" />
            </div>
            <div className="relative">
              <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                Profile
              </label>
              <select
                value={materialDesign}
                onChange={(e) => setMaterialDesign(e.target.value)}
                disabled={readOnly}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none disabled:opacity-60"
              >
                <option value="">Select design…</option>
                {profileOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 bottom-2.5 text-slate-300 pointer-events-none" />
            </div>
            <div className="relative">
              <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                Quote date
              </label>
              <input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                readOnly={readOnly}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] outline-none disabled:opacity-60"
              />
              <Calendar size={12} className="absolute right-2 bottom-2.5 text-slate-300 pointer-events-none" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 p-4 mb-5 bg-slate-50/50">
            <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Landmark size={12} className="text-[#134e4a]" />
              Pay into (shows on printed quotation)
            </label>
            {treasuryPayAccounts.length === 0 ? (
              <p className="text-[10px] font-medium text-amber-800 leading-snug">
                No bank accounts with a valid account number in Treasury. Add a bank account under Finance → Treasury,
                including bank name and number.
              </p>
            ) : (
              <select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-semibold text-[#134e4a] appearance-none outline-none focus:ring-2 focus:ring-[#134e4a]/10"
              >
                {treasuryPayAccounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {(a.bankName?.trim() || a.name) + ' · ' + a.accNo}
                  </option>
                ))}
              </select>
            )}
            {selectedPayTreasuryAccount ? (
              <p className="text-[9px] text-slate-500 mt-2 leading-snug">
                Customer sees: {(selectedPayTreasuryAccount.bankName?.trim() || selectedPayTreasuryAccount.name)},{' '}
                {selectedPayTreasuryAccount.accNo}, {ZAREWA_COMPANY_ACCOUNT_NAME}
              </p>
            ) : null}
          </div>

          {editData?.id && selectedCustomerId && !readOnly ? (
            <div className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-4 mb-5">
              <p className="text-[9px] font-semibold text-amber-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Wallet size={14} className="text-amber-700" />
                Apply customer advance
              </p>
              <p className="text-[10px] text-amber-900/80 leading-relaxed mb-3">
                Customer has <strong>{formatNgn(advanceBal)}</strong> on deposit. Remaining due on this quote (after
                mock paid + ledger){' '}
                <strong>{formatNgn(quoteDueNgn)}</strong>. Applying advance is not revenue — it reduces what they owe.
              </p>
              {useLedgerApi && applyAdvanceDateLocked ? (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-2 text-[10px] text-amber-950">
                  <p className="font-bold">Quotation date month is locked</p>
                  <p className="mt-0.5 leading-snug">
                    Apply advance uses the quotation date ({applyAdvanceDateISO}) for the ledger period check.
                  </p>
                  <Link to="/settings/governance" className="mt-1 inline-block font-semibold underline underline-offset-2">
                    Period controls
                  </Link>
                </div>
              ) : null}
              {applyAdvanceHint ? (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-950 space-y-1">
                  <p className="font-bold">{applyAdvanceHint.title}</p>
                  <p className="leading-snug">{applyAdvanceHint.detail}</p>
                  {applyAdvanceHint.links?.length ? (
                    <div className="flex flex-wrap gap-x-2">
                      {applyAdvanceHint.links.map((l) => (
                        <Link key={l.to} to={l.to} className="font-semibold underline underline-offset-2">
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {advanceBal <= 0 ? (
                <p className="text-[10px] font-medium text-slate-500">No advance balance — record an advance in Sales first.</p>
              ) : quoteDueNgn <= 0 ? (
                <p className="text-[10px] font-medium text-emerald-700">This quotation has no remaining balance in the ledger view.</p>
              ) : (
                <form onSubmit={submitApplyAdvance} className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="text-[9px] font-semibold text-slate-500 uppercase ml-0.5 mb-1 block">
                      Amount to apply (max {formatNgn(maxApplyAdvance)})
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={maxApplyAdvance}
                      value={applyAdvanceAmount}
                      onChange={(e) => setApplyAdvanceAmount(e.target.value)}
                      placeholder={String(maxApplyAdvance)}
                      className="w-full bg-white border border-amber-200 rounded-lg py-2 px-3 text-sm font-bold text-[#134e4a] tabular-nums outline-none focus:ring-2 focus:ring-amber-400/30"
                    />
                  </div>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-amber-600 text-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-amber-700"
                  >
                    Apply to {editData.id}
                  </button>
                </form>
              )}
            </div>
          ) : null}

          <OrderLinesSection
            title="Products"
            letter="1"
            optionItems={productOptions}
            rows={productRows}
            setRows={setProductRows}
            readOnly={readOnly}
            resolveUnitPrice={resolveUnitPrice}
          />
          <OrderLinesSection
            title="Accessories"
            letter="2"
            optionItems={accessoryOptions}
            rows={accessoryRows}
            setRows={setAccessoryRows}
            readOnly={readOnly}
            resolveUnitPrice={resolveUnitPrice}
          />
          <OrderLinesSection
            title="Services"
            letter="3"
            optionItems={serviceOptions}
            rows={serviceRows}
            setRows={setServiceRows}
            readOnly={readOnly}
            resolveUnitPrice={resolveUnitPrice}
          />
        </div>

        {useQuotationApi && editData?.id && !readOnly ? (
          <div className="px-5 py-3 border-t border-slate-200 bg-amber-50/40 shrink-0">
            <EditSecondApprovalInline
              entityKind="quotation"
              entityId={editData.id}
              value={quotationEditApprovalId}
              onChange={setQuotationEditApprovalId}
            />
          </div>
        ) : null}

        <div className="px-5 py-4 bg-[#134e4a] flex justify-between items-center text-white shrink-0 flex-wrap gap-3">
          <div>
            <p className="text-[9px] font-semibold text-white/50 uppercase tracking-widest mb-0.5">Total</p>
            <p className="text-2xl font-bold text-white tabular-nums">{formatNgn(grandTotalNgn)}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              type="button"
              disabled={readOnly || saving}
              onClick={() => void onSaveDraft()}
              className="bg-white/10 px-4 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide border border-white/15 hover:bg-white/20 disabled:opacity-40"
            >
              <Save size={14} className="inline mr-1.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => openPrintPreview('quotation')}
              className="bg-white text-[#134e4a] px-3 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm inline-flex items-center gap-1.5"
            >
              <Printer size={14} /> Quote
            </button>
            <button
              type="button"
              onClick={() => openPrintPreview('invoice')}
              className="bg-white text-[#134e4a] px-3 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm inline-flex items-center gap-1.5"
            >
              <Printer size={14} /> Invoice
            </button>
            <button
              type="button"
              onClick={() => openPrintPreview('receipt')}
              className="bg-white text-[#134e4a] px-3 py-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide shadow-sm inline-flex items-center gap-1.5"
            >
              <Printer size={14} /> Receipt
            </button>
          </div>
        </div>
      </div>

      {showPrint &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close print preview"
              className="no-print fixed inset-0 z-[11060] bg-black/50"
              onClick={() => setShowPrint(false)}
            />
            <div
              className="print-portal-scroll fixed inset-0 z-[11070] overflow-y-auto overscroll-y-contain p-4 sm:p-8"
              onClick={() => setShowPrint(false)}
            >
              <div className="mx-auto max-w-[210mm] pb-16 print:m-0 print:max-w-none print:pb-0" onClick={(e) => e.stopPropagation()}>
                <div className="quotation-print-root quotation-print-preview-mode rounded-lg border border-slate-200 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none">
                  <QuotationPrintView
                    documentKind={printDocumentKind}
                    quotationId={editData?.id ?? 'Draft'}
                    dateStr={formatDisplayDate(quoteDate)}
                    customerName={selectedCustomer?.name ?? '—'}
                    customerPhone={selectedCustomer?.phoneNumber ?? '—'}
                    terms="100%"
                    gauge={materialGauge || '—'}
                    design={materialDesign || '—'}
                    color={materialColor || '—'}
                    payAccount={payAccountForPrint}
                    lines={printLinePayload}
                    salesperson={preparedByLabel}
                    projectName={projectName.trim() || '—'}
                    amountPaidNgn={quotationPaidNgn}
                    balanceDueNgn={quotationBalanceAfterPaidNgn}
                  />
                </div>
                <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-[#134e4a] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg"
                  >
                    Print / Save as PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrint(false)}
                    className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </ModalFrame>
  );
};

export default QuotationModal;
