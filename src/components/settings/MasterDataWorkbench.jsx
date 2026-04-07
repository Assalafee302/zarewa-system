import React, { useMemo, useState } from 'react';
import { LayoutGrid, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { ModalFrame } from '../layout';
import { apiFetch } from '../../lib/apiBase';
import { useToast } from '../../context/ToastContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { APP_DATA_TABLE_PAGE_SIZE, useAppTablePaging } from '../../lib/appDataTable';
import { AppTablePager } from '../ui/AppDataTable';

/** Logical clusters for the Data & catalog tab — each opens a modal with tables. */
const WORKBENCH_GROUPS = [
  {
    id: 'quotation',
    label: 'Quotation & product setup',
    hint: 'Line items, colours, gauges, materials, and profiles used on quotes and production.',
    kinds: ['quote-items', 'colours', 'gauges', 'material-types', 'profiles'],
  },
  {
    id: 'pricing',
    label: 'Reference price book',
    hint: 'Selling rates by item, book version, attributes, and effective dates.',
    kinds: ['price-list'],
  },
  {
    id: 'finance',
    label: 'Finance',
    hint: 'Expense category labels for P&L (not bank accounts).',
    kinds: ['expense-categories'],
  },
  {
    id: 'procurement',
    label: 'Procurement & receiving',
    hint: 'Coil / SKU mapping and conversion references for purchasing and GRN.',
    kinds: ['procurement-catalog'],
  },
];

function emptyForm(fields) {
  return fields.reduce((acc, field) => {
    acc[field.key] = field.defaultValue ?? (field.type === 'checkbox' ? true : '');
    return acc;
  }, {});
}

function formFromRow(fields, row) {
  return fields.reduce((acc, field) => {
    const value = row?.[field.key];
    acc[field.key] =
      field.type === 'checkbox'
        ? Boolean(value)
        : value != null
          ? String(value)
          : field.defaultValue ?? '';
    return acc;
  }, {});
}

function rowMatchesSearch(row, query, rowSummary, tableFields) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  try {
    if (String(rowSummary(row)).toLowerCase().includes(q)) return true;
    if (String(row.id ?? '').toLowerCase().includes(q)) return true;
    for (const f of tableFields) {
      if (String(renderCellValue(f, row)).toLowerCase().includes(q)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function renderCellValue(field, row) {
  const v = row?.[field.key];
  if (field.type === 'checkbox') return v ? 'Yes' : 'No';
  if (field.type === 'select') {
    const opt = (field.options || []).find((o) => String(o.value) === String(v));
    if (opt) return opt.label;
    return v != null && v !== '' ? String(v) : '—';
  }
  if (v == null || v === '') return '—';
  return String(v);
}

function renderFieldInput(field, value, onChange, disabled) {
  if (field.type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="z-input"
      >
        <option value="">{field.placeholder || 'Select...'}</option>
        {(field.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={field.placeholder}
        className="z-input resize-none"
      />
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-600">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-[#134e4a]"
        />
        {field.checkboxLabel || field.label}
      </label>
    );
  }
  return (
    <input
      type={field.type || 'text'}
      min={field.min}
      step={field.step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={field.placeholder}
      className="z-input"
    />
  );
}

function SetupCollectionCard({
  kind,
  title,
  description,
  rows,
  fields,
  rowSummary,
  onSeedValue,
  tableLayout = false,
  filterQuery = '',
}) {
  const ws = useWorkspace();
  const { show: showToast } = useToast();
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => emptyForm(fields));

  const tableFields = useMemo(
    () => fields.filter((f) => f.type !== 'textarea').slice(0, 6),
    [fields]
  );

  const visibleRows = useMemo(() => {
    if (!filterQuery.trim()) return rows;
    return rows.filter((row) => rowMatchesSearch(row, filterQuery, rowSummary, tableFields));
  }, [rows, filterQuery, rowSummary, tableFields]);

  const rowPage = useAppTablePaging(visibleRows, APP_DATA_TABLE_PAGE_SIZE, filterQuery, kind);

  const resetForm = () => {
    setEditingId('');
    setForm(emptyForm(fields));
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm(formFromRow(fields, row));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const body = fields.reduce((acc, field) => {
      acc[field.key] = form[field.key];
      return acc;
    }, {});
    const method = editingId ? 'PATCH' : 'POST';
    const path = editingId
      ? `/api/setup/${encodeURIComponent(kind)}/${encodeURIComponent(editingId)}`
      : `/api/setup/${encodeURIComponent(kind)}`;
    const { ok, data } = await apiFetch(path, {
      method,
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not save setup record.', { variant: 'error' });
      return;
    }
    await ws?.refresh?.();
    resetForm();
    showToast(`${title} ${editingId ? 'updated' : 'added'}.`);
  };

  const removeRow = async (row) => {
    if (!window.confirm(`Delete “${rowSummary(row)}”?`)) return;
    const { ok, data } = await apiFetch(
      `/api/setup/${encodeURIComponent(kind)}/${encodeURIComponent(row.id)}`,
      { method: 'DELETE' }
    );
    if (!ok || !data?.ok) {
      showToast(data?.error || 'Could not delete setup record.', { variant: 'error' });
      return;
    }
    await ws?.refresh?.();
    if (editingId === row.id) resetForm();
    showToast(`${title} entry deleted.`);
  };

  const applyChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field.key]: value };
      if (field.key === 'quoteItemId' && typeof onSeedValue === 'function') {
        return onSeedValue(next, value);
      }
      return next;
    });
  };

  const sectionShell = tableLayout
    ? 'border-b border-slate-200/80 pb-5 mb-5 last:mb-0 last:border-0 last:pb-0'
    : 'rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm';

  return (
    <section className={sectionShell}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 pr-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#134e4a] mb-0.5">
            {title}
          </h3>
          <p className="text-[10px] text-slate-500 leading-snug">{description}</p>
        </div>
        <button type="button" onClick={resetForm} className="z-btn-secondary shrink-0 !px-3 !py-1.5 !text-[10px] gap-1">
          <Plus size={14} /> New
        </button>
      </div>

      <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={submit}>
        {fields.map((field) => (
          <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
            {field.type !== 'checkbox' ? <label className="z-field-label">{field.label}</label> : null}
            {renderFieldInput(field, form[field.key], (value) => applyChange(field, value), saving)}
          </div>
        ))}
        <div className="md:col-span-2 flex flex-wrap justify-end gap-1.5 pt-1">
          {editingId ? (
            <button type="button" onClick={resetForm} className="z-btn-secondary !px-3 !py-1.5 !text-[10px] gap-1">
              <X size={14} /> Cancel
            </button>
          ) : null}
          <button type="submit" disabled={saving} className="z-btn-primary !px-3 !py-1.5 !text-[10px] gap-1">
            <Save size={14} /> {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
          </button>
        </div>
      </form>

      {tableLayout ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/90">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold uppercase tracking-wide text-slate-600">
              <tr>
                {tableFields.map((f) => (
                  <th key={f.key} className="px-2.5 py-2.5">
                    {f.label}
                  </th>
                ))}
                <th className="px-2.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={tableFields.length + 1} className="px-3 py-6 text-center text-slate-500">
                    No rows yet.
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={tableFields.length + 1} className="px-3 py-6 text-center text-slate-500">
                    No rows match your filter.
                  </td>
                </tr>
              ) : (
                rowPage.slice.map((row) => (
                  <tr key={row.id} className="bg-white/95 hover:bg-teal-50/30">
                    {tableFields.map((f) => (
                      <td
                        key={f.key}
                        className="px-2.5 py-2.5 align-middle text-slate-800 max-w-0 whitespace-nowrap truncate"
                        title={String(renderCellValue(f, row))}
                      >
                        {renderCellValue(f, row)}
                      </td>
                    ))}
                    <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="z-btn-secondary !inline-flex !px-2 !py-1 !text-[10px] gap-0.5 mr-1"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeRow(row)}
                        className="z-btn-secondary !inline-flex !px-2 !py-1 !text-[10px] gap-0.5"
                      >
                        <Trash2 size={12} /> Del
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      {tableLayout && visibleRows.length > 0 ? (
        <AppTablePager
          showingFrom={rowPage.showingFrom}
          showingTo={rowPage.showingTo}
          total={rowPage.total}
          hasPrev={rowPage.hasPrev}
          hasNext={rowPage.hasNext}
          onPrev={rowPage.goPrev}
          onNext={rowPage.goNext}
        />
      ) : null}
      {!tableLayout ? (
        <div className="mt-3 space-y-1.5">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-[11px] text-slate-500">
              No setup rows yet.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/50 px-3 py-3 text-[11px] text-slate-600">
              No rows match your filter.
            </div>
          ) : (
            rowPage.slice.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 text-sm font-medium text-slate-800 truncate" title={`${rowSummary(row)} · ${row.id}`}>
                  {rowSummary(row)} <span className="font-mono text-slate-500">· {row.id}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => startEdit(row)} className="z-btn-secondary !px-2.5 !py-1 !text-[10px] gap-1">
                    <Pencil size={12} /> Edit
                  </button>
                  <button type="button" onClick={() => void removeRow(row)} className="z-btn-secondary !px-2.5 !py-1 !text-[10px] gap-1">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
      {!tableLayout && visibleRows.length > 0 ? (
        <AppTablePager
          showingFrom={rowPage.showingFrom}
          showingTo={rowPage.showingTo}
          total={rowPage.total}
          hasPrev={rowPage.hasPrev}
          hasNext={rowPage.hasNext}
          onPrev={rowPage.goPrev}
          onNext={rowPage.goNext}
        />
      ) : null}
    </section>
  );
}

export default function MasterDataWorkbench({ masterData }) {
  const ws = useWorkspace();
  const [openGroupId, setOpenGroupId] = useState(null);
  const [modalSearch, setModalSearch] = useState('');

  const productInventoryOptions = useMemo(
    () =>
      (ws?.snapshot?.products || []).map((p) => ({
        value: p.productID,
        label: `${p.name || p.productID} (${p.productID})`,
      })),
    [ws?.snapshot?.products]
  );

  const procurementCatalogRows = useMemo(
    () => masterData?.procurementCatalog ?? [],
    [masterData?.procurementCatalog]
  );
  const quoteItemOptions = useMemo(
    () =>
      (masterData?.quoteItems || []).map((row) => ({
        value: row.id,
        label: `${row.name} (${row.itemType})`,
        unit: row.unit,
        name: row.name,
      })),
    [masterData?.quoteItems]
  );
  const colourOptions = useMemo(
    () =>
      (masterData?.colours || []).map((row) => ({
        value: row.id,
        label: `${row.name} (${row.abbreviation})`,
      })),
    [masterData?.colours]
  );
  const gaugeOptions = useMemo(
    () =>
      (masterData?.gauges || []).map((row) => ({
        value: row.id,
        label: row.label,
      })),
    [masterData?.gauges]
  );
  const materialOptions = useMemo(
    () =>
      (masterData?.materialTypes || []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
    [masterData?.materialTypes]
  );
  const profileOptions = useMemo(
    () =>
      (masterData?.profiles || []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
    [masterData?.profiles]
  );

  const sections = useMemo(
    () => [
    {
      kind: 'quote-items',
      title: 'Quotation items',
      description: 'Products, services, and accessories used in quotation order lines.',
      rows: masterData?.quoteItems || [],
      fields: [
        {
          key: 'itemType',
          label: 'Item type',
          type: 'select',
          options: [
            { value: 'product', label: 'Product' },
            { value: 'accessory', label: 'Accessory' },
            { value: 'service', label: 'Service' },
          ],
        },
        { key: 'name', label: 'Name' },
        { key: 'unit', label: 'Default unit', placeholder: 'm / box / job' },
        { key: 'defaultUnitPriceNgn', label: 'Default unit price', type: 'number', min: '0', step: '1' },
        {
          key: 'inventoryProductId',
          label: 'Stock product (accessories)',
          type: 'select',
          options: productInventoryOptions,
          placeholder: 'None',
        },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Visible in forms', defaultValue: true },
      ],
      rowSummary: (row) =>
        `${row.name} · ${row.itemType} · ${row.unit}${row.defaultUnitPriceNgn ? ` · ₦${Number(row.defaultUnitPriceNgn).toLocaleString()}` : ''}${row.inventoryProductId ? ` · stock:${row.inventoryProductId}` : ''}`,
    },
    {
      kind: 'colours',
      title: 'Colours',
      description: 'Full colour names and abbreviations used in quotations, procurement, and production.',
      rows: masterData?.colours || [],
      fields: [
        { key: 'name', label: 'Colour name' },
        { key: 'abbreviation', label: 'Abbreviation', placeholder: 'HMB / IV / TB' },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Visible in forms', defaultValue: true },
      ],
      rowSummary: (row) => `${row.name} (${row.abbreviation})`,
    },
    {
      kind: 'gauges',
      title: 'Gauges',
      description: 'Gauge labels and thickness values used by quotations and the conversion engine.',
      rows: masterData?.gauges || [],
      fields: [
        { key: 'label', label: 'Gauge label', placeholder: '0.24mm' },
        { key: 'gaugeMm', label: 'Thickness (mm)', type: 'number', min: '0', step: '0.01' },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Visible in forms', defaultValue: true },
      ],
      rowSummary: (row) => `${row.label} · ${row.gaugeMm}mm`,
    },
    {
      kind: 'material-types',
      title: 'Material types',
      description: 'Density and width values used to calculate the standard conversion reference.',
      rows: masterData?.materialTypes || [],
      fields: [
        { key: 'name', label: 'Material type' },
        { key: 'densityKgPerM3', label: 'Density (kg/m3)', type: 'number', min: '0', step: '1' },
        { key: 'widthM', label: 'Width (m)', type: 'number', min: '0', step: '0.01' },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Visible in forms', defaultValue: true },
      ],
      rowSummary: (row) => `${row.name} · density ${Number(row.densityKgPerM3).toLocaleString()} · width ${row.widthM}m`,
    },
    {
      kind: 'profiles',
      title: 'Profiles',
      description: 'Production profile and roofing design labels used in quotations.',
      rows: masterData?.profiles || [],
      fields: [
        { key: 'name', label: 'Profile name' },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Visible in forms', defaultValue: true },
      ],
      rowSummary: (row) => row.name,
    },
    {
      kind: 'price-list',
      title: 'Price list',
      description: 'Reference selling rates by item, gauge, colour, material, and profile.',
      rows: masterData?.priceList || [],
      fields: [
        { key: 'quoteItemId', label: 'Quote item', type: 'select', options: quoteItemOptions, placeholder: 'Optional link' },
        { key: 'itemName', label: 'Item name' },
        { key: 'bookLabel', label: 'Price book', placeholder: 'Standard / Promo / Branch A' },
        { key: 'bookVersion', label: 'Book version', type: 'number', min: '1', step: '1', defaultValue: 1 },
        { key: 'effectiveFromISO', label: 'Effective from (YYYY-MM-DD)', placeholder: '2026-04-01' },
        { key: 'unit', label: 'Unit', placeholder: 'm / job / box' },
        { key: 'unitPriceNgn', label: 'Unit price', type: 'number', min: '0', step: '1' },
        { key: 'gaugeId', label: 'Gauge', type: 'select', options: gaugeOptions, placeholder: 'Any gauge' },
        { key: 'colourId', label: 'Colour', type: 'select', options: colourOptions, placeholder: 'Any colour' },
        {
          key: 'materialTypeId',
          label: 'Material type',
          type: 'select',
          options: materialOptions,
          placeholder: 'Any material',
        },
        { key: 'profileId', label: 'Profile', type: 'select', options: profileOptions, placeholder: 'Any profile' },
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What this reference price is for...' },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Visible in forms', defaultValue: true },
      ],
      rowSummary: (row) =>
        `${row.itemName} · v${Number(row.bookVersion) || 1} ${row.bookLabel || 'Standard'} · ${row.unit} · ₦${Number(
          row.unitPriceNgn || 0
        ).toLocaleString()}`,
      onSeedValue: (next, quoteItemId) => {
        const selected = quoteItemOptions.find((option) => option.value === quoteItemId);
        if (!selected) return next;
        return {
          ...next,
          itemName: selected.name,
          unit: next.unit || selected.unit || '',
        };
      },
    },
    {
      kind: 'expense-categories',
      title: 'Expense categories',
      description:
        'Labels for Finance expenses (P&L grouping). Treasury accounts stay under Finance; this is the category dimension only.',
      rows: masterData?.expenseCategories || [],
      fields: [
        { key: 'name', label: 'Category name', placeholder: 'e.g. Diesel & fuel' },
        { key: 'code', label: 'Short code (optional)', placeholder: 'FUEL' },
        { key: 'sortOrder', label: 'Sort order', type: 'number', min: '0', step: '1', defaultValue: 0 },
        { key: 'active', label: 'Active', type: 'checkbox', checkboxLabel: 'Offer in expense form', defaultValue: true },
      ],
      rowSummary: (row) =>
        `${row.name}${row.code ? ` · ${row.code}` : ''}${row.active ? '' : ' (inactive)'}`,
    },
    {
      kind: 'procurement-catalog',
      title: 'Procurement catalogue',
      description:
        'Reference coil lines (colour, gauge, conversion, stock SKU) used to map purchases to inventory and the conversion table.',
      rows: procurementCatalogRows,
      fields: [
        { key: 'label', label: 'List label', placeholder: 'IV 0.24 — heavy line' },
        { key: 'productID', label: 'Stock product id', placeholder: 'COIL-ALU or PRD-102' },
        { key: 'color', label: 'Colour (as on PO line)', placeholder: 'IV' },
        { key: 'gauge', label: 'Gauge label', placeholder: '0.24' },
        { key: 'offerKg', label: 'Offer kg', type: 'number', min: '0', step: '1' },
        { key: 'offerMeters', label: 'Offer metres (ref)', type: 'number', min: '0', step: '0.1' },
        { key: 'conversionKgPerM', label: 'Conversion kg/m', type: 'number', min: '0', step: '0.01' },
      ],
      rowSummary: (row) => `${row.label} · ${row.productID} · ${row.color} ${row.gauge}`,
    },
    ],
    [
      masterData,
      procurementCatalogRows,
      productInventoryOptions,
      quoteItemOptions,
      colourOptions,
      gaugeOptions,
      materialOptions,
      profileOptions,
    ]
  );

  const sectionByKind = Object.fromEntries(sections.map((s) => [s.kind, s]));
  const openGroup = WORKBENCH_GROUPS.find((g) => g.id === openGroupId);

  return (
    <>
      <div
        className="md-master-workbench space-y-4 [&_.z-field-label]:mb-1 [&_.z-field-label]:text-[9px] [&_.z-input]:py-2 [&_.z-input]:px-3 [&_.z-input]:text-xs [&_.z-input]:font-medium [&_select.z-input]:py-2"
      >
        {WORKBENCH_GROUPS.map((group) => (
          <section
            key={group.id}
            className="rounded-xl border border-slate-200/85 bg-gradient-to-br from-white to-slate-50/40 p-4 sm:p-5 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-[#134e4a]">{group.label}</h2>
                <p className="mt-1 text-[10px] text-slate-500 leading-snug max-w-2xl">{group.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalSearch('');
                  setOpenGroupId(group.id);
                }}
                className="z-btn-primary shrink-0 gap-2 !text-[11px]"
              >
                <LayoutGrid size={16} /> Open catalog
              </button>
            </div>
          </section>
        ))}
      </div>

      <ModalFrame
        isOpen={openGroupId != null}
        onClose={() => {
          setModalSearch('');
          setOpenGroupId(null);
        }}
        title={openGroup?.label ?? 'Catalog'}
        description="Edit reference lists used across the system. Use the form to add or update, the table for quick review. Filter applies to all tables in this catalog."
      >
        <div className="w-full max-w-[min(100%,1120px)] max-h-[min(88vh,920px)] overflow-y-auto rounded-[28px] border border-slate-200/90 bg-white p-4 shadow-xl sm:p-6">
          {openGroup ? (
            <>
              <div className="sticky top-0 z-[1] -mt-1 mb-4 border-b border-slate-100 bg-white pb-3 pt-1">
                <label htmlFor="catalog-search" className="sr-only">
                  Filter catalog rows
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    id="catalog-search"
                    type="search"
                    placeholder="Filter table rows (name, id, or any visible column)…"
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="z-input w-full pl-9"
                    aria-label="Filter catalog rows"
                  />
                </div>
              </div>
              <div className="space-y-2">
                {openGroup.kinds.map((kind) => {
                  const cfg = sectionByKind[kind];
                  return cfg ? (
                    <SetupCollectionCard key={kind} {...cfg} tableLayout filterQuery={modalSearch} />
                  ) : null;
                })}
              </div>
            </>
          ) : null}
        </div>
      </ModalFrame>
    </>
  );
}
