import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { AuthScreen } from '@/src/components/auth-screen';
import { Button, Feedback, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { getDefaultWorkspaceRoute } from '@/src/lib/work-mode';
import { colors, layout, typeScale } from '@/src/theme';

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
      <View style={layout.centered}>
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
        title={copy('เชื่อมต่อบัญชีไม่ได้ชั่วคราว', 'Could not reconnect your account')}
        subtitle={copy(
          'ข้อมูลเข้าสู่ระบบเดิมยังถูกเก็บไว้อย่างปลอดภัย',
          'Your existing sign-in is still stored safely.',
        )}
      >
        <Surface>
          <Feedback
            title={copy('ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', 'Check your connection and try again')}
            detail={copy(
              'Dishy จะไม่ออกจากระบบเพราะปัญหาเครือข่ายชั่วคราว',
              'Dishy will not sign you out because of a temporary network problem.',
            )}
            tone="warning"
          />
          <Button
            label={copy('ลองอีกครั้ง', 'Try again')}
            onPress={() => void retrySessionRestore()}
          />
        </Surface>
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
