import type { TextStyle } from 'react-native';

export const APP_FONT_FAMILIES = {
  regular: 'Kanit_400Regular',
  medium: 'Kanit_500Medium',
  semiBold: 'Kanit_600SemiBold',
  bold: 'Kanit_700Bold',
  extraBold: 'Kanit_800ExtraBold',
} as const;

const NAMED_FONT_WEIGHTS: Record<string, number> = {
  normal: 400,
  ultralight: 400,
  thin: 400,
  light: 400,
  regular: 400,
  condensed: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  condensedBold: 700,
  heavy: 800,
  black: 800,
};

export function resolveAppFontWeight(
  fontWeight?: TextStyle['fontWeight'],
  inheritedFontWeight: TextStyle['fontWeight'] = 'normal',
) {
  return fontWeight ?? inheritedFontWeight ?? 'normal';
}

export function resolveAppFontFamily(
  fontWeight?: TextStyle['fontWeight'],
) {
  const weightLabel = fontWeight === undefined ? 'normal' : String(fontWeight);
  const numericWeight =
    NAMED_FONT_WEIGHTS[weightLabel] ?? Number.parseInt(weightLabel, 10);

  if (numericWeight >= 800) return APP_FONT_FAMILIES.extraBold;
  if (numericWeight >= 700) return APP_FONT_FAMILIES.bold;
  if (numericWeight >= 600) return APP_FONT_FAMILIES.semiBold;
  if (numericWeight >= 500) return APP_FONT_FAMILIES.medium;
  return APP_FONT_FAMILIES.regular;
}
