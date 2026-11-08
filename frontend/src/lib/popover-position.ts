type Rect = { left: number; top: number; bottom: number; width: number };
type Size = { width: number; height: number };

export function placePopover(anchor: Rect, menu: Size, viewport: Size) {
  const margin = 8;
  const gap = 6;
  const width = Math.min(Math.max(menu.width, anchor.width), viewport.width - margin * 2);
  const below = Math.max(0, viewport.height - margin - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - margin);
  const placement = below >= Math.min(menu.height, 160) || below >= above ? 'bottom' : 'top';
  const height = Math.min(menu.height, placement === 'bottom' ? below : above);
  const top = placement === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height;
  return {
    left: Math.max(margin, Math.min(anchor.left, viewport.width - margin - width)),
    top: Math.max(margin, Math.min(top, viewport.height - margin - height)),
    width,
    height,
    placement,
  };
}
