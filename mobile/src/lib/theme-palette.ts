export const palette = {
  canvas: '#FFF7ED',
  surface: '#FFFCF8',
  surfaceSubtle: '#FFF4E8',
  surfaceStrong: '#FFEDD5',
  border: '#FED7AA',
  // A hairline between rows of a list, where `border` is far too loud: that one
  // is a real orange and turns a plain list into a set of boxes. This is the
  // canvas warmth desaturated until it only separates.
  divider: '#EFE7DF',
  borderStrong: '#B96E3F',
  controlBorder: '#C77948',
  text: '#3F2A20',
  textStrong: '#21130C',
  muted: '#6B4636',
  placeholder: '#76503D',
  primary: '#C2410C',
  primaryText: '#FFFFFF',
  accent: '#C2410C',
  accentSoft: '#FFF7ED',
  accentMuted: '#FED7AA',
  navigationSurface: '#9A3412',
  navigationActive: '#FFEDD5',
  navigationActiveText: '#7C2D12',
  navigationMuted: '#FED7AA',
  navigationBorder: '#7C2D12',
  shadow: '#7C2D12',
  success: '#047857',
  successSoft: '#ECFDF5',
  warning: '#B45309',
  // One step deeper than the -50 tints these started on. On a cream canvas a
  // -50 tint is barely a tint at all: an occupied table read as off-white, and
  // the status had to be carried entirely by its text.
  warningSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEF2F2',
  info: '#0369A1',
  infoSoft: '#E0F2FE',
  neutral: '#475569',
  neutralSoft: '#F1F5F9',
} as const;
