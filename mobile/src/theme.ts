import { StyleSheet } from 'react-native';

import { palette } from '@/src/lib/theme-palette';

export { palette };

// Compatibility alias for existing screens while they move onto the new shared shell.
export const colors = palette;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const breakpoints = {
  tablet: 768,
  tabletWorkspace: 900,
  expandedRail: 1240,
} as const;

export const radius = {
  sm: 4,
  md: 6,
  full: 999,
} as const;

export const typeScale = StyleSheet.create({
  hero: {
    color: palette.textStrong,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 31,
    letterSpacing: -0.3,
  },
  title: {
    color: palette.textStrong,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  body: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
  },
  caption: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  number: {
    color: palette.textStrong,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});

export const layout = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: palette.canvas,
  },
});

export const inputStyles = StyleSheet.create({
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: palette.controlBorder,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceSubtle,
    color: palette.textStrong,
    fontSize: 16,
    paddingHorizontal: spacing.md,
  },
});

export function statusTone(tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral') {
  switch (tone) {
    case 'success':
      return { color: palette.success, backgroundColor: palette.successSoft, borderColor: '#A7F3D0' };
    case 'warning':
      return { color: palette.warning, backgroundColor: palette.warningSoft, borderColor: '#FDE68A' };
    case 'danger':
      return { color: palette.danger, backgroundColor: palette.dangerSoft, borderColor: '#FECACA' };
    case 'info':
      return { color: palette.info, backgroundColor: palette.infoSoft, borderColor: '#BAE6FD' };
    default:
      return { color: palette.neutral, backgroundColor: palette.neutralSoft, borderColor: palette.border };
  }
}
