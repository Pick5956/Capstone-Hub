import { useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/src/components/app-icon';
import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { ChipGroup, EdgeSection, EdgeSectionHeader, Feedback } from '@/src/components/ui';
import type { DisplayLanguage } from '@/src/lib/display-preferences';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';

export default function DisplaySettingsScreen() {
  const { width } = useWindowDimensions();
  const {
    copy,
    language,
    persistenceStatus,
    setLanguage,
  } = useDisplayPreferences();
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  const languageOptions: Array<{
    label: string;
    value: DisplayLanguage;
  }> = [
    { label: 'ไทย', value: 'th' },
    { label: 'English', value: 'en' },
  ];
  const persistenceCopy =
    persistenceStatus === 'loading'
      ? {
          title: copy('กำลังโหลดการตั้งค่า', 'Loading settings'),
          detail: copy('กำลังอ่านค่าจากอุปกรณ์', 'Reading preferences from this device.'),
          tone: 'info' as const,
        }
      : persistenceStatus === 'saving'
        ? {
            title: copy('กำลังบันทึก', 'Saving'),
            detail: copy('กำลังบันทึกลงอุปกรณ์', 'Saving on this device.'),
            tone: 'info' as const,
          }
        : persistenceStatus === 'memory-only'
          ? {
              title: copy('บันทึกถาวรไม่ได้', 'Could not save permanently'),
              detail: copy('ใช้ได้ในรอบนี้ แต่อาจถูกรีเซ็ตเมื่อปิดแอป', 'Works for this session, but may reset after the app closes.'),
              tone: 'warning' as const,
            }
          : {
              title: copy('บันทึกแล้ว', 'Saved'),
              detail: copy('ใช้ค่าเดิมเมื่อเปิดแอปครั้งถัดไป', 'Restored the next time the app opens.'),
              tone: 'success' as const,
            };

  return (
    <AppScreen
      title={copy('การแสดงผล', 'Display')}
      subtitle={copy('ใช้เฉพาะอุปกรณ์นี้', 'Applies to this device')}
      topLevel={false}
    >
      <View style={{ gap: spacing.sm }}>
        <EdgeSectionHeader title={copy('ภาษา', 'Language')} action={<AppIcon color={palette.muted} name="language-outline" size={21} />} />
        <EdgeSection style={{ gap: spacing.md, padding: spacing.lg }}>
          <ChipGroup value={language} options={languageOptions} onChange={setLanguage} />
          {persistenceStatus !== 'saved' ? (
            <Feedback title={persistenceCopy.title} detail={persistenceCopy.detail} tone={persistenceCopy.tone} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppIcon color={palette.success} name="checkmark-circle-outline" size={18} />
              <Text style={[typeScale.caption, { color: palette.muted }]}>{persistenceCopy.title}</Text>
            </View>
          )}
        </EdgeSection>
      </View>
    </AppScreen>
  );
}
