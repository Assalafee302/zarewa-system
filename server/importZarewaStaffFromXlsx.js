/**
 * Import staff from an Excel (.xlsx) salary register into SQLite.
 * Skips any row whose branch/location/site text contains "Jalingo" (case-insensitive).
 *
 * Usage (from project root):
 *   set ZAREWA_STAFF_IMPORT_PASSWORD=YourStrongPassw0rd!
 *   node server/importZarewaStaffFromXlsx.js --file "docs/SALARY/your-file.xlsx"
 *
 * Options:
 *   --dry-run     Parse and report only; no DB writes.
 *   --annual      Treat salary column as annual gross (÷12 for monthly base in app).
 *   --actor ID    app_users.id for updated_by (default: first admin or hr_admin).
 */
import fs from 'node:fs';
import XLSX from 'xlsx';
import { createDatabase, defaultDbPath } from './db.js';
import { upsertHrStaffProfile, registerNewStaffWithProfile } from './hrOps.js';
import { DEFAULT_BRANCH_ID } from './branches.js';

function normHeader(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[_#]/g, ' ')
    .trim();
}

function findCol(headerToKey, ...want) {
  for (const w of want) {
    const nw = normHeader(w);
    for (const [h, orig] of headerToKey) {
      if (h === nw || h.includes(nw) || nw.includes(h)) return orig;
    }
  }
  return null;
}

function parseMoney(v) {
  const s = String(v ?? '').replace(/[₦#,]/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Excel serial date (1900-based) → YYYY-MM-DD */
function excelSerialToIso(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const utc = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(utc);
  if (Number.isNaN(+d)) return '';
  return d.toISOString().slice(0, 10);
}

function parseDateIso(v) {
  if (v instanceof Date && !Number.isNaN(+v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const iso = excelSerialToIso(v);
    if (iso) return iso;
  }
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const tryD = new Date(s);
  if (!Number.isNaN(+tryD)) return tryD.toISOString().slice(0, 10);
  return '';
}

function slugUsername(displayName, employeeNo) {
  const base = String(displayName || employeeNo || 'staff')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
  return base || `staff.${String(employeeNo || '').replace(/\W/g, '') || 'user'}`;
}

function mapRoleKey(raw) {
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'sales_staff';
  if (/human\s*resource|^hr\b|hr\s*admin|personnel/.test(s)) return 'hr_admin';
  if (/finance|accountant|account\s*officer/.test(s)) return 'finance_manager';
  if (/branch\s*manager|\bbm\b/.test(s)) return 'branch_manager';
  if (/sales\s*manager|commercial\s*manager/.test(s)) return 'sales_manager';
  if (/procurement|buyer/.test(s)) return 'procurement_officer';
  if (/operation|production|factory|logistics|warehouse|driver/.test(s)) return 'operations_officer';
  if (/viewer|read\s*only|audit/.test(s)) return 'viewer';
  if (/sales|cashier|marketer|rep|officer/.test(s)) return 'sales_staff';
  return 'sales_staff';
}

function mapBranchId(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('jalingo')) return null;
  if (s.includes('yola')) return 'BR-YOL';
  if (s.includes('maiduguri') || s.includes('maig')) return 'BR-MAI';
  if (s.includes('kaduna') || s.includes('hq') || s.includes('head office') || s.includes('kano')) return 'BR-KAD';
  if (/^br-/i.test(String(raw ?? '').trim())) {
    const id = String(raw).trim().toUpperCase();
    if (id.startsWith('BR-')) return id;
  }
  return DEFAULT_BRANCH_ID;
}

function rowIsJalingo(row, branchCol, extraCols) {
  const bag = [];
  if (branchCol) bag.push(String(row[branchCol] ?? ''));
  for (const c of extraCols) {
    if (c) bag.push(String(row[c] ?? ''));
  }
  const t = bag.join(' ').toLowerCase();
  return t.includes('jalingo');
}

function pickActorUserId(db, explicit) {
  if (explicit) return explicit;
  const r =
    db.prepare(`SELECT id FROM app_users WHERE role_key = 'admin' LIMIT 1`).get() ||
    db.prepare(`SELECT id FROM app_users WHERE role_key = 'hr_admin' LIMIT 1`).get() ||
    db.prepare(`SELECT id FROM app_users WHERE status = 'active' LIMIT 1`).get();
  return r?.id || null;
}

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const annual = argv.includes('--annual');
  const fileIdx = argv.indexOf('--file');
  const actorIdx = argv.indexOf('--actor');
  const file = fileIdx >= 0 ? argv[fileIdx + 1] : null;
  const actorArg = actorIdx >= 0 ? argv[actorIdx + 1] : null;

  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node server/importZarewaStaffFromXlsx.js --file "path/to/file.xlsx"');
    console.error('Set ZAREWA_STAFF_IMPORT_PASSWORD to a strong password (12+ chars, mixed case, number, symbol).');
    process.exit(1);
  }

  const password = String(process.env.ZAREWA_STAFF_IMPORT_PASSWORD || '').trim();
  if (!dry && password.length < 12) {
    console.error('Missing or weak ZAREWA_STAFF_IMPORT_PASSWORD (min 12 chars, mixed case, number, symbol).');
    process.exit(1);
  }

  const dbPath = process.env.ZAREWA_DB_PATH || defaultDbPath();
  const db = createDatabase(dbPath);
  const actorUserId = pickActorUserId(db, actorArg);
  if (!actorUserId) {
    console.error('No actor user id (need at least one app user).');
    process.exit(1);
  }

  const wb = XLSX.readFile(file, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (!rows.length) {
    console.error('No data rows in first sheet:', sheetName);
    process.exit(1);
  }

  const firstKeys = Object.keys(rows[0]);
  const headerToKey = new Map(firstKeys.map((k) => [normHeader(k), k]));

  const colName = findCol(headerToKey, 'full name', 'name', 'staff name', 'employee name', 'names', 'surname');
  const colEmp = findCol(headerToKey, 'employee no', 'emp no', 'staff id', 'id', 'employee id', 'code');
  const colBranch = findCol(headerToKey, 'branch', 'location', 'site', 'office', 'station');
  const colDept = findCol(headerToKey, 'department', 'dept', 'unit');
  const colJob = findCol(headerToKey, 'job title', 'position', 'designation', 'role title');
  const colRole = findCol(headerToKey, 'app role', 'system role', 'role key', 'user role', 'role');
  const colBase = findCol(
    headerToKey,
    'basic salary',
    'base salary',
    'monthly gross',
    'gross salary',
    'salary',
    'basic',
    'monthly basic',
    'total package'
  );
  const colHousing = findCol(headerToKey, 'housing', 'rent', 'housing allowance');
  const colTrans = findCol(headerToKey, 'transport', 'transport allowance');
  const colJoined = findCol(headerToKey, 'date joined', 'joined', 'employment date', 'start date');
  const colQual = findCol(
    headerToKey,
    'academic qualification',
    'qualification',
    'education',
    'certificate',
    'degree',
    'credentials'
  );
  const colMinQual = findCol(headerToKey, 'minimum qualification', 'min qualification', 'job qualification');
  const colUser = findCol(headerToKey, 'username', 'login', 'user id');

  if (!colName) {
    console.error('Could not find a name column. Headers seen:', firstKeys.join(' | '));
    process.exit(1);
  }

  const siteCols = [colBranch, findCol(headerToKey, 'region', 'area')].filter(Boolean);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  const usedUsernames = new Set(
    db
      .prepare(`SELECT lower(trim(username)) AS u FROM app_users`)
      .all()
      .map((r) => r.u)
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const displayName = String(row[colName] ?? '').trim();
    if (!displayName || /^total|^subtotal|^grand/i.test(displayName)) {
      skipped++;
      continue;
    }

    if (rowIsJalingo(row, colBranch, siteCols)) {
      console.log(`Skip (Jalingo): ${displayName}`);
      skipped++;
      continue;
    }

    const employeeNo = colEmp ? String(row[colEmp] ?? '').trim() : '';
    const branchRaw = colBranch ? String(row[colBranch] ?? '').trim() : '';
    const branchId = mapBranchId(branchRaw);
    if (branchId == null) {
      console.log(`Skip (Jalingo branch text): ${displayName}`);
      skipped++;
      continue;
    }

    let base = colBase ? parseMoney(row[colBase]) : 0;
    if (annual && base > 0) base = Math.round(base / 12);
    const housing = colHousing ? parseMoney(row[colHousing]) : 0;
    const transport = colTrans ? parseMoney(row[colTrans]) : 0;
    const department = colDept ? String(row[colDept] ?? '').trim() : '';
    const jobTitle = colJob ? String(row[colJob] ?? '').trim() : '';
    const roleKey = mapRoleKey(colRole ? row[colRole] : jobTitle);
    const dateJoinedIso = colJoined ? parseDateIso(row[colJoined]) : '';
    const academicQualification = colQual ? String(row[colQual] ?? '').trim() : '';
    const minimumQualification = colMinQual ? String(row[colMinQual] ?? '').trim() : '';

    let username = colUser ? String(row[colUser] ?? '').trim().toLowerCase() : '';
    if (!username) {
      let u = slugUsername(displayName, employeeNo);
      let n = 0;
      while (usedUsernames.has(u) || u.length < 2) {
        n++;
        u = `${slugUsername(displayName, employeeNo)}.${n}`;
      }
      username = u;
    }
    username = username.toLowerCase();
    if (!username || username.length < 2) {
      errors.push({ row: i + 2, displayName, error: 'Bad username' });
      continue;
    }

    const existingByEmp =
      employeeNo &&
      db.prepare(`SELECT user_id FROM hr_staff_profiles WHERE trim(employee_no) = ?`).get(employeeNo.trim());
    const existingByUser = db.prepare(`SELECT id FROM app_users WHERE lower(trim(username)) = ?`).get(username);

    const profilePayload = {
      branchId,
      employeeNo: employeeNo || undefined,
      jobTitle: jobTitle || undefined,
      department: department || undefined,
      employmentType: 'permanent',
      dateJoinedIso: dateJoinedIso || undefined,
      baseSalaryNgn: base,
      housingAllowanceNgn: housing,
      transportAllowanceNgn: transport,
      academicQualification: academicQualification || undefined,
      minimumQualification: minimumQualification || undefined,
    };

    if (dry) {
      console.log('[dry-run]', { displayName, username, roleKey, branchId, base, employeeNo });
      continue;
    }

    if (existingByEmp?.user_id) {
      const r = upsertHrStaffProfile(db, actorUserId, {
        userId: existingByEmp.user_id,
        ...profilePayload,
      });
      if (!r.ok) errors.push({ row: i + 2, displayName, error: r.error });
      else updated++;
      continue;
    }

    if (existingByUser?.id) {
      const r = upsertHrStaffProfile(db, actorUserId, {
        userId: existingByUser.id,
        ...profilePayload,
      });
      if (!r.ok) errors.push({ row: i + 2, displayName, error: r.error });
      else updated++;
      continue;
    }

    const reg = registerNewStaffWithProfile(db, actorUserId, {
      username,
      displayName,
      password,
      roleKey,
      ...profilePayload,
    });
    if (!reg.ok) {
      errors.push({ row: i + 2, displayName, error: reg.error });
      continue;
    }
    usedUsernames.add(username);
    created++;
    console.log(`Created: ${displayName} → ${username} (${roleKey})`);
  }

  console.log('\nDone.', { created, updated, skipped, errors: errors.length, sheet: sheetName });
  if (errors.length) console.log('Errors:', errors);
  db.close();
}

main();
