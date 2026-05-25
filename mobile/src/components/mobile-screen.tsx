import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View, type RefreshControlProps } from 'react-native';

import { colors, layout, typeScale } from '@/src/theme';
import { MotionView } from './motion';

export function MobileScreen({
  kicker,
  title,
  subtitle,
  children,
  refreshControl,
  showBack = true,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  showBack?: boolean;
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={layout.scrollContainer}
      refreshControl={refreshControl}
    >
      <MotionView style={layout.headerRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text selectable style={typeScale.kicker}>{kicker}</Text>
          <Text selectable style={typeScale.hero}>{title}</Text>
          {subtitle ? (
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {showBack ? (
          <Pressable onPress={() => router.back()} style={layout.secondaryButton}>
            <Text style={layout.secondaryButtonText}>กลับ</Text>
          </Pressable>
        ) : null}
      </MotionView>
      <MotionView delay={60} style={{ gap: 20 }}>
        {children}
      </MotionView>
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
