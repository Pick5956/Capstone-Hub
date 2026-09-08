// The assistant's own palette, lifted from the web page (globals.css and the
// Tailwind literals the chat uses) so both surfaces look like one product. The
// rest of the app keeps its terracotta palette; only this screen is warm cream.
export const ai = {
  canvas: '#faf8f2',
  surface: '#ffffff',
  hairline: 'rgba(229,231,235,0.8)',
  hairlineSoft: 'rgba(229,231,235,0.7)',
  ink: '#111827',
  text: '#1f2937',
  body: '#374151',
  muted: '#4b5563',
  faint: '#6b7280',
  faded: '#9ca3af',
  ghost: '#d1d5db',
  orange: '#f97316',
  amber: '#f59e0b',
  deep: '#c2410c',
  orangeSoft: '#ffedd5',
  orangeLine: '#fed7aa',
  green: '#1f8b3d',
  greenIcon: '#2ba84a',
  danger: '#FF3B30',
  dangerText: '#c72c22',
  // chart tokens (light theme values of --ai-*)
  cat: ['#ea580c', '#0d9488', '#7c3aed', '#65a30d'],
  status: { critical: '#b91c1c', warning: '#b45309', good: '#15803d' },
  chartGrid: '#e8e1d3',
  chartInk: '#5c5045',
  chartInkSoft: '#8b7f70',
  // insight tones
  rose: { bg: 'rgba(255,241,242,0.7)', ring: '#ffe4e6', chip: '#ffe4e6', fg: '#be123c' },
  amberTone: { bg: '#ffffff', ring: '#f3f4f6', chip: '#fef3c7', fg: '#92400e' },
  emerald: { bg: '#ffffff', ring: '#f3f4f6', chip: '#d1fae5', fg: '#065f46' },
  neutral: { bg: '#ffffff', ring: '#f3f4f6', chip: '#f3f4f6', fg: '#4b5563' },
} as const;

export const AI_ORB_AVATAR = 30;
