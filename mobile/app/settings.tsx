import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppScreen } from '@/src/components/app-shell';
import { Button, Divider, SectionHeader, Surface } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

export default function SettingsScreen() {
  const { activeMembership, signOut, user } = useAuth();
  const canManageRestaurant = can(activeMembership, 'manage_table') || activeMembership?.role?.name === 'owner' || activeMembership?.role?.name === 'manager';
  const items = [
    { title: 'บัญชีของฉัน', detail: user?.email || 'แก้ไขชื่อและเบอร์โทร', href: '/settings/account', show: true },
    { title: 'การแสดงผล', detail: 'ภาษาและการอ่านบนอุปกรณ์', href: '/settings/display', show: true },
    { title: 'ข้อมูลร้าน', detail: 'ชื่อร้าน เวลาเปิด ค่าบริการ VAT และ PromptPay', href: '/settings/restaurant', show: canManageRestaurant },
    { title: 'ทีมและสิทธิ์', detail: 'พนักงาน บทบาท และคำเชิญ', href: '/staff', show: can(activeMembership, 'manage_staff') },
    { title: 'สลับร้าน', detail: 'เลือกร้านหรือสาขาอื่นที่คุณเป็นสมาชิก', href: '/restaurants', show: true },
  ].filter((item) => item.show);
  return (
    <AppScreen title="ตั้งค่า" subtitle="บัญชี ร้าน และทีม แยกเป็นหน้าเต็มเพื่อใช้งานง่ายบนมือถือ" topLevel>
      <Surface>
        <SectionHeader title="การตั้งค่า" />
        {items.map((item, index) => <View key={item.href}>{index ? <Divider /> : null}<Pressable onPress={() => router.push(item.href as never)} style={({ pressed }) => ({ minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.72 : 1 })}><View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}><Text style={{ color: palette.text, fontWeight: '800' }}>{item.title.slice(0, 1)}</Text></View><View style={{ minWidth: 0, flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.title}</Text><Text selectable numberOfLines={2} style={[typeScale.caption, { color: palette.muted }]}>{item.detail}</Text></View><Text style={{ color: palette.muted, fontSize: 20 }}>›</Text></Pressable></View>)}
      </Surface>
      <Surface><SectionHeader title="ออกจากระบบ" detail="ข้อมูลร้านยังคงอยู่ คุณสามารถเข้าสู่ระบบใหม่ได้ทุกเมื่อ" /><Button variant="secondary" label="ออกจากระบบ" onPress={signOut} /></Surface>
    </AppScreen>
  );
}
