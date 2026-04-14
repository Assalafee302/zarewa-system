import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * Full-viewport modal shell rendered via Radix Portal.
 * Handles accessible focus-trapping, escape-to-close, and Framer Motion layout transitions.
 */
export function ModalFrame({
  isOpen,
  onClose,
  children,
  title = 'Dialog',
  description,
  /** When false, no overlay / scroll lock (e.g. while a body-portaled print preview is open). */
  modal = true,
}) {
  const reduceMotion = useReducedMotion();
  const overlayTransition = reduceMotion ? { duration: 0 } : { duration: 0.3 };
  const contentTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring', bounce: 0, duration: 0.45 };

  return (
    <DialogPrimitive.Root
      modal={modal}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
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
              <div className="fixed inset-0 z-[1060] flex items-start justify-center overflow-y-auto overscroll-y-contain px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] outline-none sm:items-center sm:px-6 sm:py-12">
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {description ?? 'Modal dialog content.'}
                </DialogPrimitive.Description>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 10 }}
                  transition={contentTransition}
                  className="relative z-10 flex min-h-0 w-full max-w-[min(1200px,calc(100dvw-1.5rem))] items-start justify-center rounded-2xl shadow-[0_28px_80px_-36px_rgba(15,23,42,0.45)] outline-none sm:rounded-[32px]"
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
