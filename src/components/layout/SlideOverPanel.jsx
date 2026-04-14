import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

/**
 * Right-edge slide-over panel (drawer) with overlay; Radix handles focus trap and Escape.
 */
export function SlideOverPanel({
  isOpen,
  onClose,
  title = 'Panel',
  description = 'Side panel content',
  children,
  maxWidthClass = 'max-w-xl',
}) {
  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1060] bg-[#0f172a]/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={`fixed right-0 top-0 z-[1061] flex h-[100dvh] max-h-[100dvh] w-full min-w-0 ${maxWidthClass} flex-col border-l border-slate-200 bg-white pt-[env(safe-area-inset-top)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0px,env(safe-area-inset-left))] shadow-[0_0_48px_-12px_rgba(15,23,42,0.35)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300 sm:pl-0`}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
