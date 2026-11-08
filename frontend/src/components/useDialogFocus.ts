"use client";

import { useEffect, useRef } from 'react';
const activeDialogs: HTMLElement[] = [];

/** Keyboard behavior for the existing non-native modal surfaces. */
export function useDialogFocus(open: boolean, selector: string, onClose: () => void, returnFocusSelector?: string, inertBackground = false) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const dialog = document.querySelector<HTMLElement>(selector);
    if (!dialog) return;
    activeDialogs.push(dialog);
    const previous = document.activeElement;
    const background = inertBackground && dialog.parentElement ? [...dialog.parentElement.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog) : [];
    const previousInert = background.map(element => element.inert);
    const previousOverflow = document.body.style.overflow;
    background.forEach(element => { element.inert = true; });
    if (inertBackground) document.body.style.overflow = 'hidden';
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'))
      .filter(el => el.getClientRects().length > 0);
    const initial = dialog.querySelector<HTMLElement>('[autofocus]') ?? controls().find(el => el.matches('input, textarea, select')) ?? controls()[0];
    if (!dialog.contains(previous)) initial?.focus({ preventScroll: true });
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || activeDialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      } else if (event.key === 'Tab') {
        const items = controls();
        const first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      const stackIndex = activeDialogs.lastIndexOf(dialog);
      if (stackIndex !== -1) activeDialogs.splice(stackIndex, 1);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (inertBackground) document.body.style.overflow = previousOverflow;
      const target = previous instanceof HTMLElement && previous !== document.body && !dialog.contains(previous) && previous.isConnected ? previous : returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
      target?.focus({ preventScroll: true });
    };
  }, [open, selector, returnFocusSelector, inertBackground]);
}
