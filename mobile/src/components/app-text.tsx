import {
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { scaleTextMetric } from '@/src/lib/display-preferences';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';

export function AppText({ style, ...props }: TextProps) {
  const { textSize } = useDisplayPreferences();
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize =
    typeof flattened?.fontSize === 'number' ? flattened.fontSize : 14;
  const lineHeight =
    typeof flattened?.lineHeight === 'number'
      ? flattened.lineHeight
      : undefined;

  return (
    <NativeText
      {...props}
      style={[
        style,
        {
          fontSize: scaleTextMetric(fontSize, textSize),
          lineHeight:
            lineHeight === undefined
              ? undefined
              : scaleTextMetric(lineHeight, textSize),
        },
      ]}
    />
  );
}
