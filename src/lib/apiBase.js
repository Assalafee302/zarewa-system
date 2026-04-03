/** Base URL for API (empty = same origin, e.g. Vite proxy `/api` → backend). */
export function apiUrl(path) {
  const base = import.meta.env.VITE_API_BASE ?? '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function getCookie(name) {
  const target = `${encodeURIComponent(name)}=`;
  const parts = String(document.cookie || '').split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const needsCsrf = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const csrfToken = needsCsrf ? getCookie('zarewa_csrf') : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (needsCsrf && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const r = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { ok: false, error: text || 'Invalid JSON' };
  }
  return { ok: r.ok, status: r.status, data };
}
