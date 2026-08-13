import { View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { palette, radius, spacing } from '@/src/theme';

export function BrandMark({
  inverse = false,
  showName = true,
  size = 40,
}: {
  inverse?: boolean;
  showName?: boolean;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
          backgroundColor: inverse ? palette.surface : palette.primary,
        }}
      >
        <Text
          allowFontScaling={false}
          style={{
            color: palette.accent,
            fontSize: Math.round(size * 0.46),
            fontWeight: '900',
            letterSpacing: -0.8,
          }}
        >
          D
        </Text>
        <View
          style={{
            position: 'absolute',
            right: Math.max(5, Math.round(size * 0.16)),
            bottom: Math.max(5, Math.round(size * 0.16)),
            width: Math.max(3, Math.round(size * 0.1)),
            height: Math.max(3, Math.round(size * 0.1)),
            borderRadius: radius.full,
            backgroundColor: inverse ? palette.primary : palette.surface,
          }}
        />
      </View>
      {showName ? (
        <Text
          style={{
            color: inverse ? palette.primaryText : palette.textStrong,
            fontSize: size >= 44 ? 19 : 17,
            fontWeight: '800',
            letterSpacing: -0.35,
          }}
        >
          Dishy
        </Text>
      ) : null}
    </View>
  );
}
