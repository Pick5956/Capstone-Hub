import { useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/src/components/app-icon';
import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { ChipGroup, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import type {
  DisplayLanguage,
  DisplayTextSize,
} from '@/src/lib/display-preferences';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';

export default function DisplaySettingsScreen() {
  const { width } = useWindowDimensions();
  const {
    copy,
    language,
    persistenceStatus,
    setLanguage,
    setTextSize,
    textSize,
  } = useDisplayPreferences();
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;

  const languageOptions: Array<{
    label: string;
    value: DisplayLanguage;
  }> = [
    { label: 'ไทย', value: 'th' },
    { label: 'English', value: 'en' },
  ];
  const textSizeOptions: Array<{
    label: string;
    value: DisplayTextSize;
  }> = [
    { label: copy('เล็ก', 'Small'), value: 'small' },
    { label: copy('ปกติ', 'Default'), value: 'normal' },
    { label: copy('ใหญ่', 'Large'), value: 'large' },
    { label: copy('ใหญ่มาก', 'Extra large'), value: 'extra-large' },
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
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1 : undefined, gap: spacing.lg }}>
          <Surface>
            <SectionHeader title={copy('ภาษา', 'Language')} action={<AppIcon color={palette.muted} name="language-outline" size={21} />} />
            <ChipGroup value={language} options={languageOptions} onChange={setLanguage} />
          </Surface>
        </View>
        <Surface style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.15 : undefined }}>
          <SectionHeader title={copy('ขนาดตัวอักษร', 'Text size')} detail={copy('ทำงานร่วมกับขนาดตัวอักษรของเครื่อง', 'Works with the device text-size setting.')} action={<AppIcon color={palette.muted} name="text-outline" size={21} />} />
          <ChipGroup value={textSize} options={textSizeOptions} onChange={setTextSize} />
          <View style={{ borderTopWidth: 1, borderTopColor: palette.border, paddingTop: spacing.md }}>
            <Text selectable style={[typeScale.body, { color: palette.text }]}>
              {copy('ตัวอย่างข้อความ', 'Text preview')}
            </Text>
          </View>
          {persistenceStatus !== 'saved' ? (
            <Feedback title={persistenceCopy.title} detail={persistenceCopy.detail} tone={persistenceCopy.tone} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppIcon color={palette.success} name="checkmark-circle-outline" size={18} />
              <Text style={[typeScale.caption, { color: palette.muted }]}>{persistenceCopy.title}</Text>
            </View>
          )}
        </Surface>
      </View>
    </AppScreen>
  );
}
