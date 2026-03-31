/** Base URL for API (empty = same origin, e.g. Vite proxy `/api` → backend). */
export function apiUrl(path) {
  const base = import.meta.env.VITE_API_BASE ?? '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch(path, options = {}) {
  const r = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
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
