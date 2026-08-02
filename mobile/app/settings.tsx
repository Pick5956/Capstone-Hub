import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/src/components/app-shell';
import { AppText as Text } from '@/src/components/app-text';
import { Button, Divider, SectionHeader, Surface } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

export default function SettingsScreen() {
  const { activeMembership, signOut, user } = useAuth();
  const { copy } = useDisplayPreferences();
  const managementRole = activeMembership?.role?.name === 'owner' || activeMembership?.role?.name === 'manager';
  const canManageRestaurant = managementRole && can(activeMembership, 'manage_staff');
  const canManageTeam = managementRole && can(activeMembership, 'manage_staff');
  const items = [
    { title: copy('บัญชีของฉัน', 'My account'), detail: user?.email || copy('แก้ไขชื่อและเบอร์โทร', 'Edit name and phone'), href: '/settings/account', show: true },
    { title: copy('การแสดงผล', 'Display'), detail: copy('ภาษาและการอ่านบนอุปกรณ์', 'Language and readability'), href: '/settings/display', show: true },
    { title: copy('ข้อมูลร้าน', 'Restaurant'), detail: copy('ชื่อร้าน เวลาเปิด ค่าบริการ VAT และ PromptPay', 'Name, hours, service charge, VAT and PromptPay'), href: '/settings/restaurant', show: canManageRestaurant },
    { title: copy('ทีมและสิทธิ์', 'Team and access'), detail: copy('พนักงาน บทบาท และคำเชิญ', 'Staff, roles and invitations'), href: '/staff', show: canManageTeam },
    { title: copy('สลับร้าน', 'Switch restaurant'), detail: copy('เลือกร้านหรือสาขาอื่นที่คุณเป็นสมาชิก', 'Choose another restaurant or branch'), href: '/restaurants', show: true },
  ].filter((item) => item.show);
  return (
    <AppScreen title={copy('ตั้งค่า', 'Settings')} subtitle={copy('บัญชี ร้าน และทีม แยกเป็นหน้าเต็มเพื่อใช้งานง่ายบนมือถือ', 'Account, restaurant and team settings in focused mobile screens')} topLevel>
      <Surface>
        <SectionHeader title={copy('การตั้งค่า', 'Settings')} />
        {items.map((item, index) => <View key={item.href}>{index ? <Divider /> : null}<Pressable onPress={() => router.push(item.href as never)} style={({ pressed }) => ({ minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.72 : 1 })}><View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.surfaceStrong }}><Text style={{ color: palette.text, fontWeight: '800' }}>{item.title.slice(0, 1)}</Text></View><View style={{ minWidth: 0, flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{item.title}</Text><Text selectable numberOfLines={2} style={[typeScale.caption, { color: palette.muted }]}>{item.detail}</Text></View><Text style={{ color: palette.muted, fontSize: 20 }}>›</Text></Pressable></View>)}
      </Surface>
      <Surface><SectionHeader title={copy('ออกจากระบบ', 'Sign out')} detail={copy('ข้อมูลร้านยังคงอยู่ คุณสามารถเข้าสู่ระบบใหม่ได้ทุกเมื่อ', 'Restaurant data remains available when you sign in again.')} /><Button variant="secondary" label={copy('ออกจากระบบ', 'Sign out')} onPress={signOut} /></Surface>
    </AppScreen>
  );
}
