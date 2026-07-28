import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AppText as Text } from '@/src/components/app-text';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { getDefaultWorkspaceRoute } from '@/src/lib/work-mode';
import { colors, layout, typeScale } from '@/src/theme';

export default function IndexScreen() {
  const { status, user, activeMembership, memberships } = useAuth();
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

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!activeMembership || memberships.length === 0) {
    return <Redirect href="/restaurants" />;
  }

  return <Redirect href={getDefaultWorkspaceRoute(activeMembership)} />;
}
