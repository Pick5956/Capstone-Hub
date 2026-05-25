import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View, type RefreshControlProps } from 'react-native';

import { colors, layout, typeScale } from '@/src/theme';

export function MobileScreen({
  kicker,
  title,
  subtitle,
  children,
  refreshControl,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={layout.scrollContainer}
      refreshControl={refreshControl}
    >
      <View style={layout.headerRow}>
        <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>กลับ</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable style={typeScale.kicker}>{kicker}</Text>
          <Text selectable style={typeScale.hero}>{title}</Text>
          {subtitle ? (
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

export function StateMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={layout.panel}>
      <Text selectable style={typeScale.cardTitle}>{title}</Text>
      {detail ? (
        <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
