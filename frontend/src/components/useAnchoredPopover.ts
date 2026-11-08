"use client";

import { useLayoutEffect, type RefObject } from 'react';
import { placePopover } from '@/lib/popover-position';

/** Keep the menu in its owner DOM for semantics/focus; native top layer avoids clipping. */
export function useAnchoredPopover(open: boolean, root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!open) return;
    const owner = root.current;
    const menu = owner?.querySelector<HTMLElement>('[data-anchored-popover]');
    const trigger = owner?.querySelector<HTMLElement>('[aria-haspopup], input');
    if (!menu || !trigger) return;
    menu.setAttribute('popover', 'manual');
    menu.style.position = 'fixed';
    menu.style.margin = '0';
    menu.style.minWidth = '0';
    menu.style.inset = 'auto';
    menu.style.overflowY = 'auto';
    menu.style.maxWidth = 'calc(100vw - 16px)';
    // An element inside a native dialog stays in that dialog's top-layer ordering.
    menu.showPopover?.();
    function position() {
      if (!menu || !trigger) return;
      menu.style.maxHeight = 'none';
      menu.style.width = '';
      const viewport = window.visualViewport;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const anchor = trigger.getBoundingClientRect();
      const result = placePopover({ left: anchor.left - offsetLeft, top: anchor.top - offsetTop, bottom: anchor.bottom - offsetTop, width: anchor.width }, menu.getBoundingClientRect(), {
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
      });
      menu.style.left = `${result.left + offsetLeft}px`;
      menu.style.top = `${result.top + offsetTop}px`;
      menu.style.width = `${result.width}px`;
      menu.style.maxHeight = `${result.height}px`;
    }
    position();
    function scroll(event: Event) {
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      position();
    }
    const restore = document.activeElement;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      if (menu.contains(document.activeElement) && restore === trigger) {
        if (trigger instanceof HTMLInputElement) trigger.dataset.popoverRestore = 'true';
        trigger.focus({ preventScroll: true });
        queueMicrotask(() => { delete trigger.dataset.popoverRestore; });
      }
      if (menu.matches(':popover-open')) menu.hidePopover?.();
    };
  }, [open, root]);
}
