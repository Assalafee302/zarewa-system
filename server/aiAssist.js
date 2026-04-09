/**
 * Optional OpenAI-compatible chat completions proxy.
 * Configure with ZAREWA_AI_API_KEY (or OPENAI_API_KEY) — key never leaves the server.
 */

const MAX_MESSAGES = 20;
const MAX_CONTENT_PER_MESSAGE = 8000;
const MAX_CONTEXT_LEN = 500;

function trimBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '');
}

export function readAiAssistConfig() {
  const apiKey = String(process.env.ZAREWA_AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const baseUrl = trimBaseUrl(process.env.ZAREWA_AI_BASE_URL || 'https://api.openai.com/v1');
  const model = String(process.env.ZAREWA_AI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  return { enabled: Boolean(apiKey), apiKey, baseUrl, model };
}

export function chatCompletionsUrl(baseUrl) {
  const b = trimBaseUrl(baseUrl);
  if (!b) return 'https://api.openai.com/v1/chat/completions';
  return b.endsWith('/v1') ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

export function sanitizeClientMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages.slice(-MAX_MESSAGES)) {
    const role = String(m?.role || '').toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;
    let content = String(m?.content ?? '');
    if (content.length > MAX_CONTENT_PER_MESSAGE) {
      content = `${content.slice(0, MAX_CONTENT_PER_MESSAGE)}…`;
    }
    content = content.trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

function buildSystemPrompt(context, userDisplay) {
  const ctx = String(context || '').trim().slice(0, MAX_CONTEXT_LEN);
  const who = String(userDisplay || '').trim().slice(0, 120);
  const lines = [
    'You are a concise assistant for Zarewa System users (sales, procurement, operations, finance, HR).',
    'You do not have access to live database records, files, or the ability to run actions in the app.',
    'Explain concepts, suggest workflows, and help interpret terminology. For balances, tax, or legal matters, tell the user to verify in the system or with qualified staff.',
    'Keep answers short unless the user asks for detail. Use clear headings or bullets when helpful.',
  ];
  if (who) lines.push(`The signed-in user is referred to as: ${who}.`);
  if (ctx) lines.push(`The user is currently viewing: ${ctx}.`);
  return lines.join('\n');
}

/**
 * @param {{ messages: unknown[], context?: string, userDisplay?: string }} opts
 * @returns {Promise<{ content: string }>}
 */
export async function runAiChat(opts) {
  const cfg = readAiAssistConfig();
  if (!cfg.enabled) {
    const err = new Error('AI assistant is not configured.');
    err.code = 'AI_DISABLED';
    throw err;
  }

  const sanitized = sanitizeClientMessages(opts.messages);
  if (sanitized.length === 0) {
    const err = new Error('Send at least one user message.');
    err.code = 'AI_BAD_REQUEST';
    throw err;
  }

  const system = buildSystemPrompt(opts.context, opts.userDisplay);
  const url = chatCompletionsUrl(cfg.baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: system }, ...sanitized],
      max_tokens: 1200,
      temperature: 0.25,
    }),
  });

  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      (json && json.error && (json.error.message || json.error)) ||
      (raw ? raw.slice(0, 240) : '') ||
      `HTTP ${res.status}`;
    const err = new Error(String(msg));
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  const content = json?.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === '') {
    const err = new Error('Empty response from AI provider.');
    err.code = 'AI_EMPTY';
    throw err;
  }

  return { content: String(content) };
}
