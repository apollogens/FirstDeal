import type { Page } from '@playwright/test';

// Explicit semantic roles supplement the text scan with focus and field borders.
export async function auditSemanticContrast(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span'); document.body.append(probe);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas color parser unavailable');
    const parse = (css: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = css; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
    const rgb = (token: string) => { probe.style.color = `var(${token})`; return parse(getComputedStyle(probe).color).slice(0, 3); };
    const luminance = (values: number[]) => values.reduce((sum, value, index) => { const s = value / 255; return sum + (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index]; }, 0);
    const pairs: [string, string, number][] = [
      ['--foreground', '--surface', 4.5], ['--foreground-muted', '--surface-elevated', 4.5],
      ['--primary-foreground', '--primary', 4.5], ['--focus-ring', '--surface', 3],
      ['--border-strong', '--surface', 3], ['--success', '--success-soft', 4.5],
      ['--warning', '--warning-soft', 4.5], ['--danger', '--danger-soft', 4.5],
    ];
    const rows = pairs.map(([foreground, background, minimum]) => { const a = luminance(rgb(foreground)); const b = luminance(rgb(background)); return { foreground, background, minimum, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }; });
    for (const field of document.querySelectorAll<HTMLElement>('input, textarea, select, button[aria-haspopup="listbox"]')) {
      const style = getComputedStyle(field); const rect = field.getBoundingClientRect();
      if (field.matches(':disabled, [aria-disabled="true"], [type="checkbox"], [type="radio"], [type="file"]') || !rect.width || !rect.height || style.visibility !== 'visible' || Number(style.opacity) === 0 || style.borderTopStyle === 'none' || parseFloat(style.borderTopWidth) === 0) continue;
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const hit = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)), Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2)));
      if (hit && hit !== field && !field.contains(hit) && !hit.contains(field)) continue;
      let background = '';
      for (let element: Element | null = field; element; element = element.parentElement) {
        const color = getComputedStyle(element).backgroundColor;
        if (color.startsWith('rgb(')) { background = color; break; }
      }
      if (!background) continue;
      const border = parse(style.borderTopColor); const base = parse(background).slice(0, 3);
      const a = luminance(border.slice(0, 3).map((value, index) => value * border[3] / 255 + base[index] * (1 - border[3] / 255)));
      const b = luminance(base);
      rows.push({ foreground: `field border: ${field.tagName}#${field.id}.${field.className} (${style.borderTopColor})`, background, minimum: 3, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) });
    }
    probe.remove(); return rows;
  });
}

export async function auditTextContrast(page: Page) {
  return page.evaluate(() => {
    type Color = [number, number, number, number];
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas color parser unavailable');
    const colorCache = new Map<string, Color>();
    const color = (value: string): Color => {
      const cached = colorCache.get(value); if (cached) return cached;
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data; const result: Color = [d[0], d[1], d[2], d[3] / 255]; colorCache.set(value, result); return result;
    };
    const over = (a: Color, b: Color): Color => [a[0] * a[3] + b[0] * (1 - a[3]), a[1] * a[3] + b[1] * (1 - a[3]), a[2] * a[3] + b[2] * (1 - a[3]), 1];
    const luminance = (c: Color) => c.slice(0, 3).reduce((sum, v, i) => { const s = v / 255; return sum + (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]; }, 0);
    const ratio = (a: Color, b: Color) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const background = (el: Element) => {
      const layers: Color[] = []; let complex = false;
      const target = el.getBoundingClientRect(); const x = target.left + target.width / 2; const y = target.top + target.height / 2;
      for (let p: Element | null = el; p; p = p.parentElement) {
        const s = getComputedStyle(p); if (s.backgroundImage !== 'none') complex = true;
        // The animated navigation reveal is painted behind text by an absolute
        // child or a full-size pseudo-element, rather than by its button box.
        const reveal = [...p.children].find(child => {
          const style = getComputedStyle(child); const rect = child.getBoundingClientRect();
          return !child.contains(el) && style.position === 'absolute' && style.pointerEvents === 'none' && Number(style.opacity) === 1 && color(style.backgroundColor)[3] === 1 && rect.left <= x && rect.right >= x && rect.top <= y && rect.bottom >= y;
        });
        if (reveal) { layers.push(color(getComputedStyle(reveal).backgroundColor)); break; }
        let pseudoSurface: Color | undefined;
        for (const pseudo of ['::before', '::after']) {
          const style = getComputedStyle(p, pseudo); const rect = p.getBoundingClientRect();
          if (style.content !== 'none' && style.position === 'absolute' && Number(style.opacity) === 1 && style.pointerEvents === 'none' && parseFloat(style.width) >= rect.width - 2 && parseFloat(style.height) >= rect.height - 2 && color(style.backgroundColor)[3] === 1 && !style.transform.startsWith('matrix(0')) pseudoSurface = color(style.backgroundColor);
        }
        if (pseudoSurface) { layers.push(pseudoSurface); break; }
        const c = color(s.backgroundColor); layers.push(c); if (c[3] === 1) break;
      }
      return { value: layers.reverse().reduce((b, a) => over(a, b), [255, 255, 255, 1] as Color), complex };
    };
    const rows = [];
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'OPTION'].includes(el.tagName) || el.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth || s.visibility !== 'visible' || Number(s.opacity) === 0 || parseFloat(s.fontSize) === 0) continue;
      const hit = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2)), Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2)));
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
      const isField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      const placeholder = isField && !el.value ? el.placeholder : '';
      const text = isField ? el.value || placeholder : [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent?.trim()).filter(Boolean).join(' ');
      if (!text) continue;
      if (el instanceof HTMLInputElement && ['hidden', 'checkbox', 'radio', 'file', 'range', 'color'].includes(el.type)) continue;
      const fgStyle = placeholder ? getComputedStyle(el, '::placeholder') : s;
      const bg = background(el); const fg: Color = [...color(fgStyle.color)]; fg[3] *= Number(fgStyle.opacity); const value = ratio(over(fg, bg.value), bg.value);
      const threshold = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700) ? 3 : 4.5;
      const ancestors = [];
      if (!bg.complex && value < threshold) {
        for (let p: Element | null = el; p && ancestors.length < 6; p = p.parentElement) { const style = getComputedStyle(p); ancestors.push({ tag: p.tagName, className: p.getAttribute('class'), background: style.backgroundColor, image: style.backgroundImage, display: style.display }); }
      }
      rows.push({ tag: el.tagName, className: el.className, text: text.slice(0, 90), color: s.color, background: bg.value, fontSize: s.fontSize, fontWeight: s.fontWeight, ratio: value, threshold, complexBackground: bg.complex, opacity: s.opacity, ancestors });
    }
    return rows;
  });
}
