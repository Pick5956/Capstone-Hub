import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { BrandMark } from '@/src/components/brand-mark';
import { Button } from '@/src/components/ui';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { colors, layout, spacing, typeScale } from '@/src/theme';

export default function NotFoundScreen() {
  const { copy } = useDisplayPreferences();

  return (
    <>
      <Stack.Screen options={{ title: copy('ไม่พบหน้า', 'Not found') }} />
      <View style={[layout.centered, { backgroundColor: colors.surface }]}>
        <BrandMark size={46} />
        <Text selectable style={typeScale.title}>
          {copy('ไม่พบหน้านี้', 'This page was not found')}
        </Text>
        <Text selectable style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
          {copy('กลับไปหน้าเริ่มต้นของ Dishy', 'Return to the Dishy home screen')}
        </Text>
        <View style={{ width: '100%', maxWidth: 320, marginTop: spacing.sm }}>
          <Button
            icon="home-outline"
            label={copy('กลับหน้าแรก', 'Back to home')}
            onPress={() => router.replace('/')}
          />
        </View>
      </View>
    </>
  );
}
