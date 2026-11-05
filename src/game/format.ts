// Idle-game number formatting: 999, 1.2K, 3.4M, 5.6B, 7.8T, 1.2Qa …

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(v) / 3));
  const scaled = v / Math.pow(1000, tier);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${scaled.toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, '$1')}${SUFFIXES[tier]}`;
}
