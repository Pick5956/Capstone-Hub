import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { palette } from '@/src/theme';

export type AppIconName = ComponentProps<typeof Ionicons>['name'];

export function AppIcon({
  name,
  size = 20,
  color = palette.text,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      accessibilityElementsHidden
      color={color}
      importantForAccessibility="no-hide-descendants"
      name={name}
      size={size}
    />
  );
}
