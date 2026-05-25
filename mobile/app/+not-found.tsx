import { Link, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { colors, layout, typeScale } from '@/src/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={layout.centered}>
        <Text selectable style={typeScale.title}>ไม่พบหน้านี้</Text>
        <Text selectable style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
          กลับไปหน้าเริ่มต้นของ Restaurant Hub
        </Text>
        <Link href="/" asChild>
          <Pressable style={layout.primaryButton}>
            <Text style={layout.primaryButtonText}>กลับหน้าแรก</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}
