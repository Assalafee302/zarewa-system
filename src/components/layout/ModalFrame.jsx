import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * Full-viewport modal shell rendered via Radix Portal.
 * Handles accessible focus-trapping, escape-to-close, and Framer Motion layout transitions.
 */
export function ModalFrame({ isOpen, onClose, children, title = 'Dialog', description }) {
  const reduceMotion = useReducedMotion();
  const overlayTransition = reduceMotion ? { duration: 0 } : { duration: 0.3 };
  const contentTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', bounce: 0, duration: 0.45 };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
                className="fixed inset-0 z-[1060] bg-[#0f172a]/60 backdrop-blur-md"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <div className="fixed inset-0 z-[1060] flex items-start justify-center sm:items-center px-4 py-10 sm:px-6 sm:py-12 overflow-y-auto overscroll-contain outline-none">
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {description ?? 'Modal dialog content.'}
                </DialogPrimitive.Description>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 10 }}
                  transition={contentTransition}
                  className="relative z-10 w-full max-w-[min(100%,1200px)] flex justify-center items-start min-h-0 outline-none rounded-[32px] shadow-[0_28px_80px_-36px_rgba(15,23,42,0.45)]"
                >
                  {children}
                </motion.div>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
