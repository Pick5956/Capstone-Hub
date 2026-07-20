import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius, spacing, typeScale } from '@/src/theme';

export function AuthScreen({ title, subtitle, children, showBack = false }: { title: string; subtitle: string; children: React.ReactNode; showBack?: boolean }) {
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
            {tablet ? <View style={{ width: '38%', justifyContent: 'space-between', backgroundColor: palette.primary, padding: spacing.xxxl }}><View style={{ gap: spacing.md }}><Text style={{ color: '#FB923C', fontSize: 14, fontWeight: '800' }}>RESTAURANT HUB</Text><Text style={{ color: palette.primaryText, fontSize: 30, lineHeight: 38, fontWeight: '700' }}>งานหน้าร้าน ครัว และหลังร้าน ในระบบเดียว</Text></View><Text style={{ color: '#CBD5E1', fontSize: 14, lineHeight: 21 }}>ออกแบบสำหรับเจ้าของร้าน พนักงานเสิร์ฟ แคชเชียร์ และครัวระหว่างกะจริง</Text></View> : null}
            <View style={{ flex: 1, gap: spacing.xl, padding: tablet ? spacing.xxxl : spacing.sm }}>
              {showBack ? <Pressable accessibilityLabel="ย้อนกลับ" onPress={() => router.back()} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>‹</Text></Pressable> : null}
              <View style={{ gap: spacing.sm }}>{!tablet ? <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '800' }}>RESTAURANT HUB</Text> : null}<Text selectable style={typeScale.hero}>{title}</Text><Text selectable style={[typeScale.body, { color: palette.muted }]}>{subtitle}</Text></View>
              {children}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
