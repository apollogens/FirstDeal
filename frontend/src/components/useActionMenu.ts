"use client";

import { useEffect, useRef, type RefObject } from 'react';
import { useAnchoredPopover } from './useAnchoredPopover';

/** Dismiss a row menu without stealing focus from another clicked control. */
export function useActionMenu(open: boolean, root: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useAnchoredPopover(open, root);
  useEffect(() => {
    if (!open) return;
    const owner = root.current;
    function outside(event: PointerEvent) {
      if (!owner?.contains(event.target as Node)) close.current();
    }
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented || !owner?.contains(event.target as Node)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        owner.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
        close.current();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(owner.querySelectorAll<HTMLElement>('[data-anchored-popover] button:not(:disabled), [data-anchored-popover] a[href]'));
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
        items[index].focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [open, root]);
}
