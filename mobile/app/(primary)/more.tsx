import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/src/components/app-icon';
import { appNavigation, AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { Divider, SectionHeader, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';

const toolGroups = [
  { key: 'restaurant', itemKeys: ['menu', 'inventory', 'tables-manage', 'reservations'] },
  { key: 'team', itemKeys: ['staff', 'reports', 'ai'] },
  { key: 'account', itemKeys: ['settings'] },
] as const;

export default function MoreScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const available = appNavigation.managementNavigation.filter((item) => appNavigation.isAllowed(item, activeMembership));
  const columns = width >= breakpoints.tabletWorkspace;

  return (
    <AppScreen title={copy('เพิ่มเติม', 'More')} topLevel>
      <View style={{ flexDirection: columns ? 'row' : 'column', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.lg }}>
        {toolGroups.map((group) => {
          const items = available.filter((item) => group.itemKeys.includes(item.key as never));
          if (!items.length) return null;
          const title = group.key === 'restaurant'
            ? copy('จัดการร้าน', 'Restaurant setup')
            : group.key === 'team'
              ? copy('ทีมและข้อมูล', 'Team and insights')
              : copy('บัญชีและการแสดงผล', 'Account and display');
          const detail = group.key === 'restaurant'
            ? copy('เมนู วัตถุดิบ โต๊ะ และการจอง', 'Menu, inventory, tables, and reservations')
            : group.key === 'team'
              ? copy('พนักงาน รายงาน และผู้ช่วยวิเคราะห์', 'Staff, reports, and the analytics assistant')
              : copy('ข้อมูลส่วนตัว ภาษา และค่าของร้าน', 'Profile, language, and restaurant settings');

          return (
            <Surface key={group.key} style={{ width: columns ? '48.5%' : '100%', flexGrow: 1, flexBasis: columns ? 360 : undefined, gap: 0, paddingVertical: 0 }}>
              <View style={{ paddingVertical: spacing.lg }}>
                <SectionHeader title={title} detail={detail} />
              </View>
              {items.map((item, index) => (
                <View key={item.key}>
                  {index ? <Divider /> : null}
                  <Pressable
                    accessibilityLabel={language === 'th' ? item.label : item.labelEn}
                    accessibilityRole="button"
                    onPress={() => router.push(item.href as never)}
                    style={({ pressed }) => ({ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: pressed ? palette.surfaceSubtle : palette.surface })}
                  >
                    <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}>
                      <AppIcon color={palette.textStrong} name={item.icon} size={20} />
                    </View>
                    <Text selectable style={[typeScale.cardTitle, { minWidth: 0, flex: 1 }]}>{language === 'th' ? item.label : item.labelEn}</Text>
                    <AppIcon color={palette.muted} name="chevron-forward" size={18} />
                  </Pressable>
                </View>
              ))}
            </Surface>
          );
        })}
      </View>
    </AppScreen>
  );
}
