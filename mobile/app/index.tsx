import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

export default function IndexScreen() {
  const { status, user, activeMembership, memberships } = useAuth();

  if (status === 'loading') {
    return (
      <View style={layout.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
          กำลังเปิด Restaurant Hub
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

  return <Redirect href="/home" />;
}
