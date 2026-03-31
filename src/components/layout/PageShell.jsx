import React from 'react';
import { motion } from 'framer-motion';

/**
 * Page wrapper. Avoid applying blur/pointer-events here — that breaks nested modals.
 * Pass `blurred` only for optional a11y hints; visuals are handled by modal backdrops.
 */
export function PageShell({ children, blurred = false, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99, y: -10 }}
      transition={{ duration: 0.6, type: 'spring', bounce: 0, ease: 'easeOut' }}
      className={`relative min-h-0 w-full max-w-[min(100%,1400px)] mx-auto ${className}`}
      aria-hidden={blurred ? 'true' : undefined}
    >
      {children}
    </motion.div>
  );
}
