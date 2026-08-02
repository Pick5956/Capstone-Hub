import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { ChipGroup, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import type {
  DisplayLanguage,
  DisplayTextSize,
} from '@/src/lib/display-preferences';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, typeScale } from '@/src/theme';

export default function DisplaySettingsScreen() {
  const {
    copy,
    language,
    persistenceStatus,
    setLanguage,
    setTextSize,
    textSize,
  } = useDisplayPreferences();

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
          detail: copy(
            'กำลังอ่านค่าที่บันทึกไว้ในอุปกรณ์',
            'Reading the preferences saved on this device.',
          ),
          tone: 'info' as const,
        }
      : persistenceStatus === 'saving'
        ? {
            title: copy('กำลังบันทึก', 'Saving'),
            detail: copy(
              'ระบบกำลังบันทึกการตั้งค่าสำหรับครั้งถัดไป',
              'Saving these preferences for the next app launch.',
            ),
            tone: 'info' as const,
          }
        : persistenceStatus === 'memory-only'
          ? {
              title: copy('บันทึกถาวรไม่ได้', 'Could not save permanently'),
              detail: copy(
                'ค่าที่เลือกยังใช้ได้ในรอบนี้ แต่จะกลับเป็นค่าเดิมเมื่อปิดแอป',
                'Your choice works for this session, but may reset after the app closes.',
              ),
              tone: 'warning' as const,
            }
          : {
              title: copy('บันทึกในอุปกรณ์แล้ว', 'Saved on this device'),
              detail: copy(
                'การตั้งค่านี้ไม่ต้อง build แอปใหม่และจะถูกใช้เมื่อเปิดแอปครั้งถัดไป',
                'No new app build is required; these settings are restored the next time the app opens.',
              ),
              tone: 'success' as const,
            };

  return (
    <AppScreen
      title={copy('การแสดงผล', 'Display')}
      subtitle={copy(
        'ตั้งค่าภาษาและขนาดข้อความสำหรับอุปกรณ์นี้',
        'Set the language and text size for this device',
      )}
      topLevel={false}
    >
      <Surface>
        <SectionHeader
          title={copy('ภาษา', 'Language')}
          detail={copy(
            'แถบนำทางและหน้าที่รองรับจะเปลี่ยนทันที โดยข้อมูลร้านและ API ไม่ถูกแก้ไข',
            'Navigation and supported screens update immediately. Restaurant and API data remain unchanged.',
          )}
        />
        <ChipGroup
          value={language}
          options={languageOptions}
          onChange={setLanguage}
        />
      </Surface>

      <Surface>
        <SectionHeader
          title={copy('ขนาดตัวอักษร', 'Text size')}
          detail={copy(
            'ใช้ร่วมกับการตั้งค่าขนาดตัวอักษรของ iOS หรือ Android',
            'Works together with the text-size setting on iOS or Android.',
          )}
        />
        <ChipGroup
          value={textSize}
          options={textSizeOptions}
          onChange={setTextSize}
        />
        <Text selectable style={[typeScale.body, { color: palette.text }]}>
          {copy(
            'ตัวอย่างข้อความสำหรับตรวจสอบความอ่านง่ายระหว่างกะ',
            'Preview text for checking readability during a shift.',
          )}
        </Text>
        <Feedback
          title={persistenceCopy.title}
          detail={persistenceCopy.detail}
          tone={persistenceCopy.tone}
        />
      </Surface>

      <Surface>
        <SectionHeader
          title={copy('หน้าจอและการหมุน', 'Screen and rotation')}
          detail={copy(
            'มือถือใช้แถบนำทางด้านล่าง ส่วน iPad ใช้แถบด้านข้าง และรองรับทั้งแนวตั้งกับแนวนอน',
            'Phones use bottom navigation, while iPad uses a side rail in portrait and landscape.',
          )}
        />
      </Surface>
    </AppScreen>
  );
}
