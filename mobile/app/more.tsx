import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { appNavigation, AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { SectionHeader, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

export default function MoreScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const items = appNavigation.managementNavigation.filter((item) => appNavigation.isAllowed(item, activeMembership));
  return (
    <AppScreen title={copy('ระบบทั้งหมด', 'All tools')} subtitle={copy('งานจัดการร้านและเครื่องมือสำหรับบทบาทของคุณ', 'Restaurant management and tools available to your role')} topLevel>
      <Surface>
        <SectionHeader title={copy('จัดการร้าน', 'Manage restaurant')} detail={copy('แต่ละงานเปิดเป็นหน้าเต็ม เพื่อให้กรอกข้อมูลและตรวจสอบได้ง่ายบนมือถือ', 'Each tool opens as a focused screen for easier mobile use.')} />
        <View style={{ gap: spacing.xs }}>
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: index ? 1 : 0, borderTopColor: palette.border, opacity: pressed ? 0.72 : 1 })}
            >
              <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}>
                <Text style={{ color: palette.text, fontSize: item.mark.length > 2 ? 10 : 13, fontWeight: '800' }}>{item.mark}</Text>
              </View>
              <Text selectable style={[typeScale.cardTitle, { flex: 1 }]}>{language === 'th' ? item.label : item.labelEn}</Text>
              <Text style={{ color: palette.muted, fontSize: 20 }}>›</Text>
            </Pressable>
          ))}
        </View>
      </Surface>
    </AppScreen>
  );
}
