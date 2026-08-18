import { Image, View } from 'react-native';
import { palette, radius, spacing } from '@/src/theme';

const WORDMARK_ASPECT_RATIO = 520 / 190;

export function BrandMark({
  inverse = false,
  showName = true,
  size = 40,
}: {
  inverse?: boolean;
  showName?: boolean;
  size?: number;
}) {
  const wordmarkHeight = size >= 44 ? 23 : 20;

  return (
    <View
      accessibilityLabel="Dishy"
      accessibilityRole="image"
      accessible
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <View
        style={{
          width: size,
          height: size,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: inverse ? 'rgba(255,255,255,0.24)' : palette.border,
          borderRadius: radius.md,
          backgroundColor: palette.surface,
        }}
      >
        <Image
          accessibilityElementsHidden
          accessibilityIgnoresInvertColors
          importantForAccessibility="no-hide-descendants"
          resizeMode="cover"
          source={require('../../assets/images/brand-logo.png')}
          style={{
            width: size - 2,
            height: size - 2,
          }}
        />
      </View>
      {showName ? (
        <Image
          accessibilityElementsHidden
          accessibilityIgnoresInvertColors
          importantForAccessibility="no-hide-descendants"
          resizeMode="contain"
          source={require('../../assets/images/dishy-wordmark.png')}
          style={{
            width: Math.round(wordmarkHeight * WORDMARK_ASPECT_RATIO),
            height: wordmarkHeight,
            tintColor: inverse ? palette.primaryText : palette.textStrong,
          }}
        />
      ) : null}
    </View>
  );
}
