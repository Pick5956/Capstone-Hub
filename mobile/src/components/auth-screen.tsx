import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/src/components/app-text';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

export function AuthScreen({ title, subtitle, children, showBack = false }: { title: string; subtitle: string; children: React.ReactNode; showBack?: boolean }) {
  const { copy, language, setLanguage } = useDisplayPreferences();
  const { width } = useWindowDimensions(); const tablet = width >= 760;
  const screenBackground = tablet ? palette.canvas : palette.surface;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: screenBackground }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ backgroundColor: screenBackground }}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: tablet ? 'center' : 'flex-start', padding: tablet ? spacing.xxxl : spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: '100%', maxWidth: 980, flexDirection: tablet ? 'row' : 'column', borderWidth: tablet ? 1 : 0, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, overflow: 'hidden' }}>
            {tablet ? <View style={{ width: '38%', justifyContent: 'space-between', backgroundColor: palette.primary, padding: spacing.xxxl }}><View style={{ gap: spacing.md }}><Text style={{ color: '#FB923C', fontSize: 14, fontWeight: '800' }}>DISHY</Text><Text style={{ color: palette.primaryText, fontSize: 30, lineHeight: 38, fontWeight: '700' }}>{copy('งานหน้าร้าน ครัว และหลังร้าน ในระบบเดียว', 'Front of house, kitchen, and back office in one place')}</Text></View><Text style={{ color: '#CBD5E1', fontSize: 14, lineHeight: 21 }}>{copy('ออกแบบสำหรับเจ้าของร้าน พนักงานเสิร์ฟ แคชเชียร์ และครัวระหว่างกะจริง', 'Built for restaurant owners, servers, cashiers, and kitchen teams during real shifts')}</Text></View> : null}
            <View style={{ flex: 1, gap: spacing.xl, padding: tablet ? spacing.xxxl : spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: showBack ? 'space-between' : 'flex-end', gap: spacing.md }}>
                {showBack ? <Pressable accessibilityLabel={copy('ย้อนกลับ', 'Go back')} onPress={() => router.back()} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>‹</Text></Pressable> : null}
                <View
                  accessibilityLabel={copy('ภาษา', 'Language')}
                  accessibilityRole="radiogroup"
                  style={{ flexDirection: 'row', gap: spacing.xs }}
                >
                  {([
                    {
                      label: 'ไทย',
                      value: 'th' as const,
                      accessibilityLabel: copy('ใช้ภาษาไทย', 'Use Thai'),
                    },
                    {
                      label: 'EN',
                      value: 'en' as const,
                      accessibilityLabel: copy('ใช้ภาษาอังกฤษ', 'Use English'),
                    },
                  ]).map((option) => {
                    const selected = language === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityLabel={option.accessibilityLabel}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => setLanguage(option.value)}
                        style={({ pressed }) => ({
                          minWidth: 46,
                          minHeight: 40,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: selected ? palette.primary : palette.borderStrong,
                          borderRadius: radius.md,
                          backgroundColor: selected ? palette.primary : palette.surface,
                          paddingHorizontal: spacing.sm,
                          opacity: pressed ? 0.72 : 1,
                        })}
                      >
                        <Text
                          style={{
                            color: selected ? palette.primaryText : palette.text,
                            fontSize: 12,
                            fontWeight: '800',
                          }}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: spacing.sm }}>{!tablet ? <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '800' }}>DISHY</Text> : null}<Text selectable style={typeScale.hero}>{title}</Text><Text selectable style={[typeScale.body, { color: palette.muted }]}>{subtitle}</Text></View>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
