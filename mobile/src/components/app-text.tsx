import { createContext, useContext } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from 'react-native';

import {
  resolveAppFontFamily,
  resolveAppFontWeight,
} from '@/src/lib/app-font';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette } from '@/src/theme';

const AppFontWeightContext = createContext<TextStyle['fontWeight']>('normal');

export function AppText({ style, ...props }: TextProps) {
  const inheritedFontWeight = useContext(AppFontWeightContext);
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontWeight = resolveAppFontWeight(
    flattened?.fontWeight,
    inheritedFontWeight,
  );
  const fontSize =
    typeof flattened?.fontSize === 'number' ? flattened.fontSize : 14;
  const lineHeight =
    typeof flattened?.lineHeight === 'number'
      ? flattened.lineHeight
      : undefined;

  return (
    <AppFontWeightContext.Provider value={fontWeight}>
      <NativeText
        {...props}
        style={[
          { color: palette.text, includeFontPadding: false },
          style,
          {
            fontFamily: resolveAppFontFamily(fontWeight),
            fontWeight: 'normal',
            fontSize,
            lineHeight,
          },
        ]}
      />
    </AppFontWeightContext.Provider>
  );
}
