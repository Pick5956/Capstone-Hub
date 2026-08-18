import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { AuthScreen } from '@/src/components/auth-screen';
import { BrandMark } from '@/src/components/brand-mark';
import { Button, Feedback } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { getDefaultWorkspaceRoute } from '@/src/lib/work-mode';
import { colors, layout, spacing, typeScale } from '@/src/theme';

export default function IndexScreen() {
  const {
    status,
    sessionRestoreError,
    retrySessionRestore,
    user,
    activeMembership,
    memberships,
  } = useAuth();
  const { copy } = useDisplayPreferences();

  if (status === 'loading') {
    return (
      <View style={[layout.centered, { backgroundColor: colors.surface }]}>
        <BrandMark size={46} />
        <ActivityIndicator color={colors.primary} />
        <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
          {copy('กำลังเปิด Dishy', 'Opening Dishy')}
        </Text>
      </View>
    );
  }

  if (status === 'recoverable-error' && sessionRestoreError) {
    return (
      <AuthScreen
        title={copy('เชื่อมต่อไม่ได้', 'Connection problem')}
      >
        <View style={{ gap: spacing.xl }}>
          <Feedback
            title={copy('ตรวจสอบอินเทอร์เน็ต', 'Check your connection')}
            detail={copy(
              'ยังเปิดบัญชีนี้ไม่ได้ในตอนนี้',
              'This account cannot be opened right now.',
            )}
            tone="warning"
          />
          <Button
            icon="wifi-outline"
            label={copy('ลองอีกครั้ง', 'Try again')}
            onPress={() => void retrySessionRestore()}
          />
        </View>
      </AuthScreen>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!activeMembership || memberships.length === 0) {
    return <Redirect href="/restaurants" />;
  }

  return <Redirect href={getDefaultWorkspaceRoute(activeMembership)} />;
}
