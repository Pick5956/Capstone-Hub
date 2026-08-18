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
  kicker: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
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
  scrollContainer: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 112,
    backgroundColor: palette.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: palette.canvas,
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
  },
  card: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    width: '48%',
    minHeight: 104,
    flexGrow: 1,
    flexBasis: 150,
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: palette.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
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
