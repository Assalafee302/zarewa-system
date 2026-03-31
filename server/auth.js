import crypto from 'node:crypto';
import { DEFAULT_BRANCH_ID, listBranches } from './branches.js';

export const SESSION_COOKIE = 'zarewa_session';
const SESSION_TTL_HOURS = 12;
const RESET_TOKEN_TTL_MINUTES = 60;
/** Max stored profile image (data URL or https URL). */
export const MAX_AVATAR_URL_LEN = 180_000;
const RESET_TOKEN_BYTES = 32;

export function validatePasswordStrength(password) {
  const p = String(password || '');
  if (p.length < 12) {
    return { ok: false, error: 'Password must be at least 12 characters.' };
  }
  if (!/[a-z]/.test(p)) {
    return { ok: false, error: 'Password must include a lowercase letter.' };
  }
  if (!/[A-Z]/.test(p)) {
    return { ok: false, error: 'Password must include an uppercase letter.' };
  }
  if (!/[0-9]/.test(p)) {
    return { ok: false, error: 'Password must include a number.' };
  }
  if (!/[^A-Za-z0-9]/.test(p)) {
    return { ok: false, error: 'Password must include a special character (for example ! @ # $).' };
  }
  return { ok: true };
}

function normalizeEmail(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

export const ROLE_DEFINITIONS = {
  admin: {
    label: 'Administrator',
    permissions: ['*'],
  },
  finance_manager: {
    label: 'Finance manager',
    permissions: [
      'dashboard.view',
      'reports.view',
      'sales.view',
      'procurement.view',
      'operations.view',
      'finance.view',
      'finance.post',
      'finance.approve',
      'finance.pay',
      'finance.reverse',
      'treasury.manage',
      'audit.view',
      'period.manage',
      'settings.view',
      'hq.view_all_branches',
    ],
  },
  sales_manager: {
    label: 'Sales manager',
    permissions: [
      'dashboard.view',
      'reports.view',
      'sales.view',
      'sales.manage',
      'customers.manage',
      'quotations.manage',
      'receipts.post',
      'refunds.request',
      'refunds.approve',
    ],
  },
  sales_staff: {
    label: 'Sales officer',
    permissions: [
      'dashboard.view',
      'sales.view',
      'customers.manage',
      'quotations.manage',
      'receipts.post',
      'refunds.request',
    ],
  },
  procurement_officer: {
    label: 'Procurement officer',
    permissions: [
      'dashboard.view',
      'reports.view',
      'procurement.view',
      'procurement.manage',
      'suppliers.manage',
      'purchase_orders.manage',
    ],
  },
  operations_officer: {
    label: 'Operations officer',
    permissions: [
      'dashboard.view',
      'reports.view',
      'operations.view',
      'operations.manage',
      'inventory.receive',
      'inventory.adjust',
      'production.manage',
      'production.release',
      'deliveries.manage',
    ],
  },
  viewer: {
    label: 'Read only',
    permissions: ['dashboard.view', 'reports.view'],
  },
};

const DEFAULT_USERS = [
  {
    id: 'USR-ADMIN',
    username: 'admin',
    displayName: 'Zarewa Admin',
    roleKey: 'admin',
    password: 'Admin@123',
  },
  {
    id: 'USR-FIN',
    username: 'finance.manager',
    displayName: 'Finance Manager',
    roleKey: 'finance_manager',
    password: 'Finance@123',
  },
  {
    id: 'USR-SM',
    username: 'sales.manager',
    displayName: 'Sales Manager',
    roleKey: 'sales_manager',
    password: 'Sales@123',
  },
  {
    id: 'USR-SS',
    username: 'sales.staff',
    displayName: 'Sales Officer',
    roleKey: 'sales_staff',
    password: 'Sales@123',
  },
  {
    id: 'USR-PROC',
    username: 'procurement',
    displayName: 'Procurement Officer',
    roleKey: 'procurement_officer',
    password: 'Procure@123',
  },
  {
    id: 'USR-OPS',
    username: 'operations',
    displayName: 'Operations Officer',
    roleKey: 'operations_officer',
    password: 'Ops@123',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function addHoursToIso(iso, hours) {
  const dt = new Date(iso);
  dt.setHours(dt.getHours() + hours);
  return dt.toISOString();
}

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || '').split(':');
  if (!salt || !expected) return false;
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(digest, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSessionToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function roleLabel(roleKey) {
  return ROLE_DEFINITIONS[roleKey]?.label || roleKey || 'User';
}

export function permissionsForRole(roleKey) {
  return [...(ROLE_DEFINITIONS[roleKey]?.permissions || [])];
}

export function userHasPermission(user, permission) {
  if (!user || !permission) return false;
  const perms = Array.isArray(user.permissions) ? user.permissions : permissionsForRole(user.roleKey);
  return perms.includes('*') || perms.includes(permission);
}

export function publicUserFromRow(row) {
  if (!row) return null;
  const roleKey = row.role_key ?? row.roleKey;
  const emailRaw = row.email ?? null;
  const avatarRaw = row.avatar_url ?? row.avatarUrl ?? null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.displayName ?? row.username,
    email: emailRaw && String(emailRaw).trim() ? String(emailRaw).trim().toLowerCase() : null,
    avatarUrl: avatarRaw && String(avatarRaw).trim() ? String(avatarRaw).trim() : null,
    roleKey,
    roleLabel: roleLabel(roleKey),
    status: row.status ?? 'active',
    lastLoginAtISO: row.last_login_at_iso ?? row.lastLoginAtISO ?? '',
    createdAtISO: row.created_at_iso ?? row.createdAtISO ?? '',
    permissions: permissionsForRole(roleKey),
  };
}

export function buildSessionPayload(user) {
  if (!user) {
    return { authenticated: false, user: null, permissions: [] };
  }
  const normalized = publicUserFromRow(user);
  return {
    authenticated: true,
    user: normalized,
    permissions: [...normalized.permissions],
  };
}

export function actorName(actor) {
  return actor?.displayName || actor?.username || actor?.name || 'System';
}

export function actorId(actor) {
  return actor?.id || null;
}

export function seedAuthUsers(db) {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM app_users`).get().c;
  if (count > 0) return;
  const ins = db.prepare(
    `INSERT INTO app_users (
      id, username, display_name, password_hash, role_key, status, last_login_at_iso, created_at_iso
    ) VALUES (?,?,?,?,?,?,?,?)`
  );
  const createdAtISO = nowIso();
  db.transaction(() => {
    for (const user of DEFAULT_USERS) {
      ins.run(
        user.id,
        user.username,
        user.displayName,
        createPasswordHash(user.password),
        user.roleKey,
        'active',
        '',
        createdAtISO
      );
    }
  })();
}

function findSessionRow(db, token) {
  return db
    .prepare(
      `       SELECT
         s.session_token,
         s.user_id,
         s.created_at_iso,
         s.last_seen_at_iso,
         s.expires_at_iso,
         s.current_branch_id,
         s.view_all_branches,
         u.id,
         u.username,
         u.display_name,
         u.email,
         u.avatar_url,
         u.role_key,
         u.status,
         u.last_login_at_iso,
         u.created_at_iso
       FROM user_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.session_token = ?`
    )
    .get(token);
}

function refreshSessionTouch(db, token, expiresAtISO) {
  db.prepare(`UPDATE user_sessions SET last_seen_at_iso = ?, expires_at_iso = ? WHERE session_token = ?`).run(
    nowIso(),
    expiresAtISO,
    token
  );
}

function defaultBranchIdForDb(db) {
  try {
    const r = db
      .prepare(`SELECT id FROM branches WHERE active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1`)
      .get();
    return r?.id || DEFAULT_BRANCH_ID;
  } catch {
    return DEFAULT_BRANCH_ID;
  }
}

export function attachAuthContext(db) {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[SESSION_COOKIE];
    req.sessionToken = token || null;
    req.user = null;
    req.session = buildSessionPayload(null);
    req.workspaceBranchId = DEFAULT_BRANCH_ID;
    req.workspaceViewAll = false;

    if (!token) return next();

    const row = findSessionRow(db, token);
    if (!row || row.status !== 'active') {
      req.sessionToken = null;
      return next();
    }
    const now = nowIso();
    if (row.expires_at_iso && row.expires_at_iso < now) {
      db.prepare(`DELETE FROM user_sessions WHERE session_token = ?`).run(token);
      req.sessionToken = null;
      return next();
    }

    const user = publicUserFromRow(row);
    req.user = user;
    const baseBranch = defaultBranchIdForDb(db);
    const currentBranchId = String(row.current_branch_id || '').trim() || baseBranch;
    const rawViewAll = Number(row.view_all_branches) === 1;
    const viewAllBranches = rawViewAll && userHasPermission(user, 'hq.view_all_branches');
    req.workspaceBranchId = currentBranchId;
    req.workspaceViewAll = viewAllBranches;
    req.session = {
      ...buildSessionPayload(user),
      currentBranchId,
      viewAllBranches,
      branches: listBranches(db),
    };
    refreshSessionTouch(db, token, addHoursToIso(now, SESSION_TTL_HOURS));
    return next();
  };
}

function sessionCookieFlags() {
  const secure =
    process.env.COOKIE_SECURE === '1' ||
    process.env.COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
  return secure ? '; Secure' : '';
}

export function setSessionCookie(res, token) {
  const extra = sessionCookieFlags();
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_HOURS * 60 * 60}${extra}`
  );
}

export function clearSessionCookie(res) {
  const extra = sessionCookieFlags();
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${extra}`);
}

export function loginWithPassword(db, username, password) {
  const row = db.prepare(`SELECT * FROM app_users WHERE username = ?`).get(String(username || '').trim());
  if (!row || row.status !== 'active') {
    return { ok: false, error: 'Invalid username or password.' };
  }
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'Invalid username or password.' };
  }

  const sessionToken = createSessionToken();
  const createdAtISO = nowIso();
  const expiresAtISO = addHoursToIso(createdAtISO, SESSION_TTL_HOURS);
  const branchId = defaultBranchIdForDb(db);
  db.transaction(() => {
    db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(row.id);
    const sessCols = db.prepare(`PRAGMA table_info(user_sessions)`).all();
    const hasBranch = sessCols.some((c) => c.name === 'current_branch_id');
    if (hasBranch) {
      db.prepare(
        `INSERT INTO user_sessions (session_token, user_id, created_at_iso, last_seen_at_iso, expires_at_iso, current_branch_id, view_all_branches)
         VALUES (?,?,?,?,?,?,?)`
      ).run(sessionToken, row.id, createdAtISO, createdAtISO, expiresAtISO, branchId, 0);
    } else {
      db.prepare(
        `INSERT INTO user_sessions (session_token, user_id, created_at_iso, last_seen_at_iso, expires_at_iso)
         VALUES (?,?,?,?,?)`
      ).run(sessionToken, row.id, createdAtISO, createdAtISO, expiresAtISO);
    }
    db.prepare(`UPDATE app_users SET last_login_at_iso = ? WHERE id = ?`).run(createdAtISO, row.id);
  })();

  return {
    ok: true,
    sessionToken,
    session: {
      ...buildSessionPayload({ ...row, last_login_at_iso: createdAtISO }),
      currentBranchId: branchId,
      viewAllBranches: false,
      branches: listBranches(db),
    },
  };
}

export function logoutSession(db, token) {
  if (!token) return;
  db.prepare(`DELETE FROM user_sessions WHERE session_token = ?`).run(token);
}

export function changePassword(db, userId, currentPassword, newPassword) {
  const row = db.prepare(`SELECT * FROM app_users WHERE id = ?`).get(userId);
  if (!row) return { ok: false, error: 'User not found.' };
  if (!verifyPassword(currentPassword, row.password_hash)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  const nextPassword = String(newPassword || '');
  const strength = validatePasswordStrength(nextPassword);
  if (!strength.ok) return strength;
  db.prepare(`UPDATE app_users SET password_hash = ? WHERE id = ?`).run(createPasswordHash(nextPassword), userId);
  return { ok: true };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {{ displayName?: string; email?: string | null; avatarUrl?: string | null }} patch
 */
export function updateUserProfile(db, userId, patch) {
  const row = db.prepare(`SELECT * FROM app_users WHERE id = ?`).get(userId);
  if (!row) return { ok: false, error: 'User not found.' };

  let displayName = row.display_name;
  if (patch.displayName != null) {
    const d = String(patch.displayName).trim();
    if (d.length < 1 || d.length > 120) {
      return { ok: false, error: 'Display name must be 1–120 characters.' };
    }
    displayName = d;
  }

  let email = row.email ?? null;
  if (patch.email !== undefined) {
    if (patch.email === null || String(patch.email).trim() === '') {
      email = null;
    } else {
      const norm = normalizeEmail(patch.email);
      if (norm === null) return { ok: false, error: 'Invalid email address.' };
      const taken = db
        .prepare(`SELECT id FROM app_users WHERE lower(trim(email)) = ? AND id != ?`)
        .get(norm, userId);
      if (taken) return { ok: false, error: 'That email is already in use.' };
      email = norm;
    }
  }

  let avatarUrl = row.avatar_url ?? null;
  if (patch.avatarUrl !== undefined) {
    if (patch.avatarUrl === null || String(patch.avatarUrl).trim() === '') {
      avatarUrl = null;
    } else {
      const a = String(patch.avatarUrl).trim();
      if (a.length > MAX_AVATAR_URL_LEN) {
        return { ok: false, error: 'Profile image is too large. Use a smaller image.' };
      }
      if (a.startsWith('data:image/')) {
        if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(a)) {
          return { ok: false, error: 'Profile image must be PNG, JPEG, or WebP (base64).' };
        }
      } else if (a.startsWith('https://')) {
        if (a.length > 2048) return { ok: false, error: 'Image URL is too long.' };
      } else {
        return { ok: false, error: 'Profile image must be a secure (https) URL or a pasted image.' };
      }
      avatarUrl = a;
    }
  }

  db.prepare(`UPDATE app_users SET display_name = ?, email = ?, avatar_url = ? WHERE id = ?`).run(
    displayName,
    email,
    avatarUrl,
    userId
  );
  const next = db.prepare(`SELECT * FROM app_users WHERE id = ?`).get(userId);
  return { ok: true, user: publicUserFromRow(next) };
}

function findUserByIdentifier(db, identifier) {
  const id = String(identifier || '').trim();
  if (!id) return null;
  const lower = id.toLowerCase();
  return db
    .prepare(
      `SELECT * FROM app_users
       WHERE status = 'active'
         AND (lower(username) = ? OR (email IS NOT NULL AND trim(email) != '' AND lower(email) = ?))`
    )
    .get(lower, lower);
}

/**
 * Creates a reset token. Always returns the same public shape (no user enumeration).
 * @returns {{ ok: true, devResetToken?: string }}
 */
export function requestPasswordReset(db, identifier) {
  const row = findUserByIdentifier(db, identifier);
  const createdAtISO = nowIso();
  const expiresAtISO = addMinutesToIso(createdAtISO, RESET_TOKEN_TTL_MINUTES);

  if (row) {
    db.prepare(`DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at_iso IS NULL`).run(row.id);
    const plain = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashResetToken(plain);
    const id = `PRT-${crypto.randomBytes(12).toString('hex')}`;
    db.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at_iso, expires_at_iso, used_at_iso)
       VALUES (?,?,?,?,?,NULL)`
    ).run(id, row.id, tokenHash, createdAtISO, expiresAtISO);

    const expose =
      process.env.ZAREWA_DEV_RESET_TOKEN === '1' || process.env.ZAREWA_DEV_RESET_TOKEN === 'true';
    if (expose) {
      return { ok: true, devResetToken: plain };
    }
  }

  return { ok: true };
}

function addMinutesToIso(iso, minutes) {
  const dt = new Date(iso);
  dt.setMinutes(dt.getMinutes() + minutes);
  return dt.toISOString();
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function completePasswordReset(db, identifier, token, newPassword) {
  const idTrim = String(identifier || '').trim();
  const tokenHash = hashResetToken(String(token || '').trim());
  const matchRow = db
    .prepare(
      `SELECT t.id AS prt_id, u.id AS user_id, u.username, u.email, u.status
       FROM password_reset_tokens t
       JOIN app_users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.used_at_iso IS NULL AND t.expires_at_iso > ?`
    )
    .get(tokenHash, nowIso());
  if (!matchRow || matchRow.status !== 'active') {
    return { ok: false, error: 'Invalid or expired reset link. Request a new reset.' };
  }

  const lower = idTrim.toLowerCase();
  const identOk =
    idTrim &&
    (String(matchRow.username || '').toLowerCase() === lower ||
      (matchRow.email && String(matchRow.email).trim().toLowerCase() === lower));
  if (!identOk) {
    return { ok: false, error: 'Invalid or expired reset link. Request a new reset.' };
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) return strength;

  db.transaction(() => {
    db.prepare(`UPDATE app_users SET password_hash = ? WHERE id = ?`).run(
      createPasswordHash(String(newPassword)),
      matchRow.user_id
    );
    db.prepare(`UPDATE password_reset_tokens SET used_at_iso = ? WHERE id = ?`).run(nowIso(), matchRow.prt_id);
    db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(matchRow.user_id);
  })();

  return { ok: true };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Sign in required.', code: 'AUTH_REQUIRED' });
  }
  return next();
}

export function requirePermission(required) {
  const perms = Array.isArray(required) ? required : [required];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Sign in required.', code: 'AUTH_REQUIRED' });
    }
    if (perms.some((perm) => userHasPermission(req.user, perm))) {
      return next();
    }
    return res.status(403).json({
      ok: false,
      error: 'You do not have permission for this action.',
      code: 'FORBIDDEN',
    });
  };
}
