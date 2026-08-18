import { forwardRef } from 'react';
import {
  StyleSheet,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { scaleTextMetric } from '@/src/lib/display-preferences';
import { resolveAppFontFamily } from '@/src/lib/app-font';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';

export const AppTextInput = forwardRef<NativeTextInput, TextInputProps>(
  function AppTextInput({ style, ...props }, ref) {
    const { textSize } = useDisplayPreferences();
    const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
    const fontSize =
      typeof flattened?.fontSize === 'number' ? flattened.fontSize : 14;
    const lineHeight =
      typeof flattened?.lineHeight === 'number'
        ? flattened.lineHeight
        : undefined;

    return (
      <NativeTextInput
        {...props}
        ref={ref}
        style={[
          { includeFontPadding: false },
          style,
          {
            fontFamily: resolveAppFontFamily(flattened?.fontWeight),
            fontWeight: 'normal',
            fontSize: scaleTextMetric(fontSize, textSize),
            lineHeight:
              lineHeight === undefined
                ? undefined
                : scaleTextMetric(lineHeight, textSize),
          },
        ]}
      />
    );
  },
);
