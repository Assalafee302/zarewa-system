import React from 'react';

/**
 * Page wrapper. Avoid applying blur/pointer-events here — that breaks nested modals.
 * Pass `blurred` only for optional a11y hints; visuals are handled by modal backdrops.
 */
export function PageShell({ children, blurred = false, className = '' }) {
  return (
    <div
      className={`relative min-h-0 w-full max-w-[min(100%,1400px)] mx-auto ${className}`}
      aria-hidden={blurred ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
