// ═══════════════════════════════════════════════════════════════════════════
// COLOR UTILS — helpers de manipulation hex/rgb
// Extrait de MemoMaster.jsx
// ═══════════════════════════════════════════════════════════════════════════

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('');

export const lightenColor = (hex, pct) => {
  try { const [r, g, b] = hexToRgb(hex); return rgbToHex(r + (255 - r) * pct / 100, g + (255 - g) * pct / 100, b + (255 - b) * pct / 100); }
  catch { return hex; }
};

export const darkenColor = (hex, pct) => {
  try { const [r, g, b] = hexToRgb(hex); return rgbToHex(r * (1 - pct / 100), g * (1 - pct / 100), b * (1 - pct / 100)); }
  catch { return hex; }
};
