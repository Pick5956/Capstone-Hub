import { Link, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { colors, layout, typeScale } from '@/src/theme';

export default function NotFoundScreen() {
  const { copy } = useDisplayPreferences();

  return (
    <>
      <Stack.Screen options={{ title: copy('ไม่พบหน้า', 'Not found') }} />
      <View style={layout.centered}>
        <Text selectable style={typeScale.title}>
          {copy('ไม่พบหน้านี้', 'This page was not found')}
        </Text>
        <Text selectable style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
          {copy('กลับไปหน้าเริ่มต้นของ Dishy', 'Return to the Dishy home screen')}
        </Text>
        <Link href="/" asChild>
          <Pressable style={layout.primaryButton}>
            <Text style={layout.primaryButtonText}>
              {copy('กลับหน้าแรก', 'Back to home')}
            </Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}
