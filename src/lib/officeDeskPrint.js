/** Escape text for safe insertion into print HTML. */
export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Print HTML in a hidden iframe (reliable from modals / slide-overs where pop-ups are blocked
 * or print() on a new window runs before layout).
 */
export function openPrintWindow(title, innerHtml) {
  const safeTitle = escapeHtml(String(title || 'Print'));

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title><style>
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      body{font-family:system-ui,-apple-system,sans-serif;padding:28px;max-width:720px;margin:0 auto;color:#0f172a;line-height:1.5;}
      h1{font-size:1.1rem;margin:0 0 12px;} .meta{font-size:12px;color:#64748b;margin-bottom:16px;} .body{white-space:pre-wrap;}
    </style></head><body>${innerHtml}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', String(title || 'Print'));
  iframe.setAttribute('aria-hidden', 'true');
  // Non-zero size so browsers lay out content for print; keep off-screen and inert.
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:8.5in;min-height:11in;border:0;opacity:0;pointer-events:none;z-index:-1;';

  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return false;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  let printScheduled = false;
  const runPrint = () => {
    if (printScheduled) return;
    printScheduled = true;
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return;
    }
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 90_000);
  };

  const schedulePrint = () => {
    requestAnimationFrame(() => {
      setTimeout(runPrint, 150);
    });
  };

  try {
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState === 'complete') {
      schedulePrint();
    } else {
      win.onload = () => schedulePrint();
    }
  } catch {
    cleanup();
    return false;
  }

  return true;
}

/**
 * Print a complete HTML document (including own &lt;head&gt; styles). Use for A4 packs from
 * `officeMemoPackPrint.js` (`buildOfficeInternalMemoPackHtml`).
 * @param {string} fullHtml
 * @param {string} [iframeTitle]
 */
export function openPrintHtmlDocument(fullHtml, iframeTitle = 'Print') {
  const html = String(fullHtml || '');
  if (!html.trim()) return false;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', iframeTitle);
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:8.5in;min-height:11in;border:0;opacity:0;pointer-events:none;z-index:-1;';

  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return false;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  let printScheduled = false;
  const runPrint = () => {
    if (printScheduled) return;
    printScheduled = true;
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return;
    }
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 90_000);
  };

  const schedulePrint = () => {
    requestAnimationFrame(() => {
      setTimeout(runPrint, 200);
    });
  };

  try {
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState === 'complete') {
      schedulePrint();
    } else {
      win.onload = () => schedulePrint();
    }
  } catch {
    cleanup();
    return false;
  }

  return true;
}
