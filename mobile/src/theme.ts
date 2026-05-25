import { StyleSheet } from 'react-native';

export const colors = {
  canvas: '#F6FAFD',
  surface: '#FFFFFF',
  border: '#DDE5ED',
  text: '#0F172A',
  muted: '#64748B',
  placeholder: '#94A3B8',
  primary: '#0F172A',
  accent: '#EA580C',
  danger: '#DC2626',
};

export const typeScale = StyleSheet.create({
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  hero: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
});

export const layout = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    gap: 20,
    padding: 20,
    paddingTop: 58,
    backgroundColor: colors.canvas,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    backgroundColor: colors.canvas,
  },
  panel: {
    gap: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  card: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '48%',
    minHeight: 112,
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
});

export const inputStyles = StyleSheet.create({
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
  },
});
