import * as XLSX from 'xlsx';

function normHeader(s) {
  return String(s ?? '')
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function numish(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function strish(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** Normalise colour/gauge for auto-generated coil tags (stable per sheet row). */
function coilSlug(s) {
  const t = strish(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 14);
  return t || 'na';
}

/**
 * Map free-text material to stock product_id (coil SKUs). Empty if unknown — caller should error.
 * @param {string} raw
 */
export function materialTextToProductId(raw) {
  const t = strish(raw);
  if (!t) return '';
  const u = t.toUpperCase();
  if (/^PRD-\d+$/i.test(t)) return u;
  if (/^COIL-[A-Z0-9_-]+$/i.test(t)) return u;
  const low = t.toLowerCase();
  if (/\baluzinc\b|\bppgi\b|\bgalvan/i.test(low) || /\bzinc\b.*\bcoil\b/i.test(low)) return 'PRD-102';
  if (/\balumin/i.test(low) || /\balu\b/i.test(low) || /\baluminium\b/i.test(low)) return 'COIL-ALU';
  return '';
}

/**
 * When the sheet has no coil tag, derive a stable id from Excel row + colour + gauge (re-import same layout upserts).
 */
function generatedStockCoilNo(excelRow, colour, gaugeLabel) {
  return `STK-L${excelRow}-${coilSlug(colour)}-${coilSlug(gaugeLabel)}`;
}

/**
 * Fill productID from Material column and/or coilNo when omitted (simple register uploads).
 * @param {ReturnType<typeof rowToPayload>} pr
 */
function finalizeCoilImportPayload(pr, excelRow) {
  const out = { ...pr };
  const matHint = strish(out.materialTypeName || '');
  if (!strish(out.productID)) {
    const pid = materialTextToProductId(matHint);
    if (pid) out.productID = pid;
  }
  if (!strish(out.coilNo)) {
    out.coilNo = generatedStockCoilNo(excelRow, out.colour, out.gaugeLabel);
  }
  return out;
}

/** @type {Record<string, string[]>} */
const COL_ALIASES = {
  coilNo: ['coil no', 'coil_no', 'coil number', 'coil', 'coil id', 'tag', 'coil tag'],
  productID: ['product id', 'product_id', 'sku', 'material sku', 'material id'],
  colour: ['colour', 'color'],
  gauge: ['gauge', 'gauge mm', 'thickness'],
  currentKg: [
    'current kg',
    'current_kg',
    'qty remaining',
    'qty_remaining',
    'on hand kg',
    'balance kg',
    'kg',
    'weight',
  ],
  qtyReserved: ['qty reserved', 'qty_reserved', 'reserved'],
  location: ['location', 'yard', 'store'],
  supplierName: ['supplier', 'supplier name', 'supplier_name'],
  supplierID: ['supplier id', 'supplier_id'],
  receivedAtISO: ['received date', 'received_at', 'received', 'date received'],
  qtyReceived: ['qty received', 'qty_received', 'original kg', 'received kg'],
  weightKg: ['weight kg', 'weight_kg', 'nominal weight'],
  unitCostNgnPerKg: ['unit cost ngn per kg', 'unit cost', 'cost per kg'],
  landedCostNgn: ['landed cost ngn', 'landed cost', 'total landed'],
  currentStatus: ['status', 'current status', 'current_status'],
  parentCoilNo: ['parent coil no', 'parent_coil_no', 'parent coil'],
  note: ['note', 'notes', 'comment', 'remarks'],
  materialTypeName: [
    'material',
    'mat',
    'metal',
    'stock material',
    'material type',
    'material_type',
  ],
  supplierExpectedMeters: ['supplier expected meters', 'expected meters', 'meters'],
  supplierConversionKgPerM: ['supplier conversion kg per m', 'conversion kg/m', 'kg per m'],
};

function resolveCell(row, aliases) {
  const pairs = Object.keys(row).map((k) => [k, normHeader(k)]);
  for (const a of aliases) {
    const na = normHeader(a);
    for (const [orig, nk] of pairs) {
      if (nk === na) return row[orig];
    }
  }
  for (const a of aliases) {
    const na = normHeader(a);
    for (const [orig, nk] of pairs) {
      // Only nk.includes(na): na.includes(nk) would match "Coil no" inside "parent coil no".
      if (na.length >= 3 && nk.includes(na)) return row[orig];
    }
  }
  return '';
}

function rowToPayload(row) {
  const coilNo = strish(resolveCell(row, COL_ALIASES.coilNo));
  const productID = strish(resolveCell(row, COL_ALIASES.productID));
  const currentKgRaw = resolveCell(row, COL_ALIASES.currentKg);
  const materialHint = strish(resolveCell(row, COL_ALIASES.materialTypeName));
  const kgEmpty = currentKgRaw === '' || currentKgRaw == null;
  if (!coilNo && !productID && !materialHint && kgEmpty) {
    return { skip: true };
  }
  const currentKg = numish(currentKgRaw);
  return {
    skip: false,
    coilNo,
    productID,
    colour: strish(resolveCell(row, COL_ALIASES.colour)) || undefined,
    gaugeLabel: strish(resolveCell(row, COL_ALIASES.gauge)) || undefined,
    currentKg: currentKg != null ? currentKg : undefined,
    qtyReserved: numish(resolveCell(row, COL_ALIASES.qtyReserved)) ?? undefined,
    location: strish(resolveCell(row, COL_ALIASES.location)) || undefined,
    supplierName: strish(resolveCell(row, COL_ALIASES.supplierName)) || undefined,
    supplierID: strish(resolveCell(row, COL_ALIASES.supplierID)) || undefined,
    receivedAtISO: strish(resolveCell(row, COL_ALIASES.receivedAtISO)) || undefined,
    qtyReceived: numish(resolveCell(row, COL_ALIASES.qtyReceived)) ?? undefined,
    weightKg: numish(resolveCell(row, COL_ALIASES.weightKg)) ?? undefined,
    unitCostNgnPerKg: numish(resolveCell(row, COL_ALIASES.unitCostNgnPerKg)) ?? undefined,
    landedCostNgn: numish(resolveCell(row, COL_ALIASES.landedCostNgn)) ?? undefined,
    currentStatus: strish(resolveCell(row, COL_ALIASES.currentStatus)) || undefined,
    parentCoilNo: strish(resolveCell(row, COL_ALIASES.parentCoilNo)) || undefined,
    note: strish(resolveCell(row, COL_ALIASES.note)) || undefined,
    materialTypeName: strish(resolveCell(row, COL_ALIASES.materialTypeName)) || undefined,
    supplierExpectedMeters: numish(resolveCell(row, COL_ALIASES.supplierExpectedMeters)) ?? undefined,
    supplierConversionKgPerM: numish(resolveCell(row, COL_ALIASES.supplierConversionKgPerM)) ?? undefined,
  };
}

/** Excel used the first data row as column names (no real header row). */
function looksLikeBrokenHeaderKeys(keys) {
  if (!keys?.length || keys.length < 3) return false;
  const nk = keys.map((k) => normHeader(String(k)));
  const hasRealHeader = nk.some(
    (k) =>
      k === 'coil no' ||
      k === 'product id' ||
      k === 'current kg' ||
      k === 'kg' ||
      k === 'material' ||
      k.includes('coil no') ||
      k.includes('product id') ||
      k.includes('current kg') ||
      k.includes('material')
  );
  if (hasRealHeader) return false;
  const numericKeyCount = keys.filter((k) => /^\d+([.,]\d+)?$/.test(String(k).trim())).length;
  const coilLikeKey = keys.some((k) => /^CL[-\d]/i.test(String(k).trim()) || /^coil[-\d]/i.test(String(k).trim()));
  return numericKeyCount >= 2 || coilLikeKey;
}

function pickSheetName(wb) {
  const names = wb.SheetNames || [];
  const byName = names.find((n) => String(n).trim().toLowerCase() === 'coils');
  return byName || names[0] || '';
}

function headerFieldForCell(h) {
  const n = normHeader(h);
  if (!n) return null;
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const a of aliases) {
      if (n === normHeader(a)) return field;
    }
  }
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const a of aliases) {
      const na = normHeader(a);
      if (na.length >= 3 && n.includes(na)) return field;
    }
  }
  return null;
}

function findHeaderRowIndex(aoa) {
  for (let r = 0; r < Math.min(aoa.length, 40); r++) {
    const row = aoa[r];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => normHeader(c));
    const hasCoil = cells.some(
      (c) => c === 'coil no' || c === 'coil_no' || c === 'coil number' || c === 'coil id' || c === 'tag'
    );
    const hasProd = cells.some((c) => c === 'product id' || c === 'product_id' || c === 'sku');
    const hasKg = cells.some(
      (c) =>
        c === 'kg' ||
        c === 'current kg' ||
        c === 'current_kg' ||
        c === 'qty remaining' ||
        c === 'qty_remaining' ||
        c === 'balance kg' ||
        c === 'on hand kg'
    );
    const hasMaterial = cells.some(
      (c) =>
        c === 'material' ||
        c === 'mat' ||
        c === 'metal' ||
        c === 'stock material' ||
        c === 'material type' ||
        c === 'material_type' ||
        (c.includes('material') && !c.includes('origin') && !c.includes('note'))
    );
    const legacy = hasCoil && hasProd && hasKg;
    const simple = hasKg && (hasMaterial || hasProd);
    if (legacy || simple) return r;
  }
  return -1;
}

function isLikelyCoilTag(v) {
  const t = strish(v);
  if (t.length < 4 || t.length > 48) return false;
  if (/^(COIL-|PRD-)/i.test(t) && !/-\d{2,}-\d+/i.test(t)) return false;
  if (/^\d+([.,]\d+)?$/.test(t)) return false;
  if (/^(available|reserved|consumed)$/i.test(t)) return false;
  return /^[A-Z]{1,6}[-.]\d{2,}[-.]?\w*$/i.test(t) || (/^[A-Z]{2,}[\w.-]+$/i.test(t) && /\d/.test(t) && /[-_.]/.test(t));
}

function isLikelyProductId(v) {
  const t = strish(v).toUpperCase();
  return /^COIL-[A-Z0-9_-]+$/i.test(t) || /^PRD-\d+$/i.test(t);
}

function isLikelyCurrentKgCell(v) {
  const n = numish(v);
  if (n == null || !Number.isFinite(n)) return false;
  return n >= 1 && n <= 250_000;
}

/**
 * When there is no header row, detect which columns hold coil tag, product id, and current kg.
 * @param {unknown[][]} aoa
 * @returns {{ coilNo: number, productID: number, currentKg: number } | null}
 */
function autoDetectCoreColumns(aoa) {
  const dataRows = aoa.filter((r) => Array.isArray(r) && r.some((c) => strish(c) !== ''));
  const sample = dataRows.slice(0, Math.min(500, dataRows.length));
  if (sample.length < 2) return null;
  const maxC = Math.max(0, ...sample.map((r) => r.length));

  let bestCoil = -1;
  let bestCoilScore = 0;
  let bestProd = -1;
  let bestProdScore = 0;
  const kgScores = [];

  for (let j = 0; j < maxC; j++) {
    let c = 0;
    let p = 0;
    let k = 0;
    for (const row of sample) {
      const cell = row[j];
      if (cell === '' || cell == null) continue;
      if (isLikelyCoilTag(cell)) c++;
      if (isLikelyProductId(cell)) p++;
      if (isLikelyCurrentKgCell(cell)) k++;
    }
    if (c > bestCoilScore) {
      bestCoilScore = c;
      bestCoil = j;
    }
    if (p > bestProdScore) {
      bestProdScore = p;
      bestProd = j;
    }
    kgScores.push({ j, k });
  }

  const minHits = Math.max(3, Math.ceil(sample.length * 0.25));
  if (bestCoil < 0 || bestCoilScore < minHits) return null;
  if (bestProd < 0 || bestProdScore < minHits) return null;

  kgScores.sort((a, b) => b.k - a.k);
  let bestKg = -1;
  for (const { j, k } of kgScores) {
    if (j === bestCoil || j === bestProd) continue;
    if (k >= minHits) {
      bestKg = j;
      break;
    }
  }
  if (bestKg < 0) return null;

  return { coilNo: bestCoil, productID: bestProd, currentKg: bestKg };
}

function mappedRowToPayload(row, colMap) {
  const fake = {};
  const set = (field, aliases) => {
    const idx = colMap[field];
    if (idx == null || idx < 0) return;
    const v = row[idx];
    if (v === '' || v == null) return;
    fake[aliases[0]] = v;
  };
  set('coilNo', ['Coil no']);
  set('productID', ['Product ID']);
  set('currentKg', ['Current kg']);
  set('colour', ['Colour']);
  set('gauge', ['Gauge']);
  set('qtyReserved', ['Qty reserved']);
  set('location', ['Location']);
  set('supplierName', ['Supplier name']);
  set('supplierID', ['Supplier ID']);
  set('receivedAtISO', ['Received date']);
  set('qtyReceived', ['Qty received']);
  set('weightKg', ['Weight kg']);
  set('unitCostNgnPerKg', ['Unit cost NGN per kg']);
  set('landedCostNgn', ['Landed cost NGN']);
  set('currentStatus', ['Status']);
  set('parentCoilNo', ['Parent coil no']);
  set('note', ['Note']);
  set('materialTypeName', ['Material']);
  return rowToPayload(fake);
}

function parseRowsFromMatrix(aoa, fileErrors) {
  const rows = [];
  const hi = findHeaderRowIndex(aoa);
  if (hi >= 0) {
    const header = aoa[hi] || [];
    /** @type {Record<string, number>} */
    const colMap = {};
    for (let c = 0; c < header.length; c++) {
      const field = headerFieldForCell(header[c]);
      if (field && colMap[field] === undefined) colMap[field] = c;
    }
    const legacy =
      colMap.coilNo !== undefined && colMap.productID !== undefined && colMap.currentKg !== undefined;
    const simple =
      colMap.currentKg !== undefined &&
      (colMap.materialTypeName !== undefined || colMap.productID !== undefined);
    if (!legacy && !simple) {
      fileErrors.push(
        'Header row: add a kg column (Kg or Current kg) plus either Material (and optional Colour, Gauge, Coil no) or Coil no + Product ID. Supplier and other columns are optional.'
      );
      return rows;
    }
    for (let r = hi + 1; r < aoa.length; r++) {
      const line = aoa[r];
      if (!Array.isArray(line) || !line.some((c) => strish(c) !== '')) continue;
      const pr0 = mappedRowToPayload(line, colMap);
      const excelRow = r + 1;
      if (pr0.skip) continue;
      const pr = finalizeCoilImportPayload(pr0, excelRow);
      if (!strish(pr.productID)) {
        fileErrors.push(
          `Row ${excelRow}: add Product ID (e.g. COIL-ALU, PRD-102) or Material (e.g. Aluminium, Aluzinc).`
        );
        continue;
      }
      if (pr.currentKg == null || !Number.isFinite(pr.currentKg)) {
        fileErrors.push(`Row ${excelRow}: missing or invalid kg.`);
        continue;
      }
      rows.push(payloadToImportRow(pr));
    }
    return rows;
  }

  const det = autoDetectCoreColumns(aoa);
  if (!det) {
    fileErrors.push(
      'Could not read columns. Use row 1 headers: Material + Kg (+ Colour, Gauge, optional Coil no), or Coil no + Product ID + Current kg, or a grid of coil tags with product codes and kg (see Store & production → Excel template).'
    );
    return rows;
  }

  const colMap = {
    coilNo: det.coilNo,
    productID: det.productID,
    currentKg: det.currentKg,
  };
  for (let r = 0; r < aoa.length; r++) {
    const line = aoa[r];
    if (!Array.isArray(line) || !line.some((c) => strish(c) !== '')) continue;
    const pr = mappedRowToPayload(line, colMap);
    const excelRow = r + 1;
    if (pr.skip) continue;
    if (!pr.coilNo || !isLikelyCoilTag(pr.coilNo)) continue;
    if (!pr.productID || !isLikelyProductId(pr.productID)) continue;
    if (pr.currentKg == null || !Number.isFinite(pr.currentKg)) {
      fileErrors.push(`Row ${excelRow}: missing or invalid current kg.`);
      continue;
    }
    rows.push(payloadToImportRow(pr));
  }
  if (!rows.length) {
    fileErrors.push(
      'No valid data rows after auto-detect. Try a clear header row: Material, Kg, Colour, Gauge (optional Coil no), or the classic Coil no / Product ID / Current kg layout.'
    );
  }
  return rows;
}

function payloadToImportRow(pr) {
  const out = {
    coilNo: pr.coilNo,
    productID: pr.productID,
    currentKg: pr.currentKg,
  };
  if (pr.colour) out.colour = pr.colour;
  if (pr.gaugeLabel) out.gaugeLabel = pr.gaugeLabel;
  if (pr.qtyReserved != null && Number.isFinite(pr.qtyReserved)) out.qtyReserved = pr.qtyReserved;
  if (pr.location) out.location = pr.location;
  if (pr.supplierName) out.supplierName = pr.supplierName;
  if (pr.supplierID) out.supplierID = pr.supplierID;
  if (pr.receivedAtISO) out.receivedAtISO = pr.receivedAtISO;
  if (pr.qtyReceived != null && Number.isFinite(pr.qtyReceived)) out.qtyReceived = pr.qtyReceived;
  if (pr.weightKg != null && Number.isFinite(pr.weightKg)) out.weightKg = pr.weightKg;
  if (pr.unitCostNgnPerKg != null && Number.isFinite(pr.unitCostNgnPerKg))
    out.unitCostNgnPerKg = pr.unitCostNgnPerKg;
  if (pr.landedCostNgn != null && Number.isFinite(pr.landedCostNgn)) out.landedCostNgn = pr.landedCostNgn;
  if (pr.currentStatus) out.currentStatus = pr.currentStatus;
  if (pr.parentCoilNo) out.parentCoilNo = pr.parentCoilNo;
  if (pr.note) out.note = pr.note;
  if (pr.materialTypeName) out.materialTypeName = pr.materialTypeName;
  if (pr.supplierExpectedMeters != null && Number.isFinite(pr.supplierExpectedMeters))
    out.supplierExpectedMeters = pr.supplierExpectedMeters;
  if (pr.supplierConversionKgPerM != null && Number.isFinite(pr.supplierConversionKgPerM))
    out.supplierConversionKgPerM = pr.supplierConversionKgPerM;
  return out;
}

function parseObjectJsonRows(json) {
  const rows = [];
  const fileErrors = [];
  for (let i = 0; i < json.length; i++) {
    const r0 = rowToPayload(json[i]);
    if (r0.skip) continue;
    const excelRow = i + 2;
    const r = finalizeCoilImportPayload(r0, excelRow);
    if (!strish(r.productID)) {
      fileErrors.push(
        `Row ${excelRow}: add Product ID (e.g. COIL-ALU, PRD-102) or Material (e.g. Aluminium, Aluzinc).`
      );
      continue;
    }
    if (r.currentKg == null || !Number.isFinite(r.currentKg)) {
      fileErrors.push(`Row ${excelRow}: missing or invalid kg.`);
      continue;
    }
    rows.push(payloadToImportRow(r));
  }
  return { rows, fileErrors };
}

/**
 * Parse first worksheet of an .xlsx / .xls file into rows for POST /api/coil-lots/import.
 * @param {ArrayBuffer} ab
 * @returns {{ rows: object[], fileErrors: string[] }}
 */
export function parseCoilImportWorkbookArrayBuffer(ab) {
  let wb;
  try {
    wb = XLSX.read(ab, { type: 'array' });
  } catch (e) {
    return { rows: [], fileErrors: [String(e.message || e) || 'Could not read spreadsheet.'] };
  }
  const name = pickSheetName(wb);
  if (!name) {
    return { rows: [], fileErrors: ['Workbook has no sheets.'] };
  }
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (!Array.isArray(json) || !json.length) {
    return { rows: [], fileErrors: ['First sheet has no data rows.'] };
  }

  const keys = Object.keys(json[0]);
  const broken = looksLikeBrokenHeaderKeys(keys);

  let rows = [];
  let fileErrors = [];

  if (!broken) {
    const o = parseObjectJsonRows(json);
    rows = o.rows;
    fileErrors = o.fileErrors;
  }

  if (rows.length === 0) {
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const matrixErrors = [];
    const matrixRows = parseRowsFromMatrix(aoa, matrixErrors);
    if (matrixRows.length > 0) {
      rows = matrixRows;
      fileErrors = matrixErrors;
    } else {
      fileErrors =
        broken && matrixErrors.length
          ? matrixErrors
          : [...fileErrors, ...matrixErrors].filter(Boolean);
      if (!fileErrors.length) {
        fileErrors = [
          'No valid coil rows found. Row 1: Material, Kg, Colour, Gauge (optional Coil no), or Coil no + Product ID + Kg — download the Excel template from Store & production (Inventory → Coil).',
        ];
      }
    }
  }

  return { rows, fileErrors };
}

export function downloadCoilImportTemplate() {
  const aoa = [
    ['Material', 'Kg', 'Colour', 'Gauge', 'Coil no (optional)'],
    ['Aluminium', '1250', 'Traffic white', '0.45', ''],
    ['Aluzinc (PPGI)', '980', 'Traffic black', '0.24', 'CL-26-0001'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Coils');
  XLSX.writeFile(wb, 'zarewa-coil-import-template.xlsx');
}
