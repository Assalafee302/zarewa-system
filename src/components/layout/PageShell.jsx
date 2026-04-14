import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Page wrapper. Avoid applying blur/pointer-events here — that breaks nested modals.
 * Pass `blurred` only for optional a11y hints; visuals are handled by modal backdrops.
 */
export function PageShell({ children, blurred = false, className = '' }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.99, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99, y: -10 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.6, type: 'spring', bounce: 0, ease: 'easeOut' }
      }
      className={`relative mx-auto min-h-0 w-full min-w-0 max-w-[min(100%,1400px)] ${className}`}
      aria-hidden={blurred ? 'true' : undefined}
    >
      {children}
    </motion.div>
  );
}
