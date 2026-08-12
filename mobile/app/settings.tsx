import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { AppScreen } from '@/src/components/app-shell';
import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { Button, Divider, Surface } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing, typeScale } from '@/src/theme';

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const { activeMembership, signOut, user } = useAuth();
  const { copy } = useDisplayPreferences();
  const tabletWorkspace = width >= breakpoints.tabletWorkspace;
  const managementRole = activeMembership?.role?.name === 'owner' || activeMembership?.role?.name === 'manager';
  const canManageRestaurant = managementRole && can(activeMembership, 'manage_staff');
  const canManageTeam = managementRole && can(activeMembership, 'manage_staff');
  const settingsItems: Array<{ title: string; detail: string; href: string; icon: AppIconName; show: boolean }> = [
    { title: copy('บัญชีของฉัน', 'My account'), detail: user?.email || copy('ชื่อและเบอร์โทร', 'Name and phone'), href: '/settings/account', icon: 'person-outline', show: true },
    { title: copy('การแสดงผล', 'Display'), detail: copy('ภาษาและขนาดตัวอักษร', 'Language and text size'), href: '/settings/display', icon: 'text-outline', show: true },
    { title: copy('ข้อมูลร้าน', 'Restaurant'), detail: copy('ข้อมูลร้าน บิล และ QR', 'Restaurant, bill and QR settings'), href: '/settings/restaurant', icon: 'storefront-outline', show: canManageRestaurant },
    { title: copy('ทีมและสิทธิ์', 'Team and access'), detail: copy('พนักงาน บทบาท และคำเชิญ', 'Staff, roles and invitations'), href: '/staff', icon: 'people-outline', show: canManageTeam },
    { title: copy('สลับร้าน', 'Switch restaurant'), detail: copy('เลือกร้านหรือสาขาอื่น', 'Choose another restaurant or branch'), href: '/restaurants', icon: 'swap-horizontal-outline', show: true },
  ];
  const items = settingsItems.filter((item) => item.show);
  return (
    <AppScreen title={copy('ตั้งค่า', 'Settings')} topLevel>
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <Surface style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.6 : undefined, gap: 0, padding: 0, overflow: 'hidden' }}>
          {items.map((item, index) => (
            <View key={item.href}>
              {index ? <Divider /> : null}
              <Pressable
                accessibilityLabel={item.title}
                accessibilityRole="button"
                onPress={() => router.push(item.href as never)}
                style={({ pressed }) => ({
                  minHeight: 64,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  backgroundColor: pressed ? palette.surfaceSubtle : palette.surface,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  opacity: pressed ? 0.78 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.surfaceSubtle }}>
                  <AppIcon color={palette.text} name={item.icon} size={21} />
                </View>
                <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
                  <Text selectable style={typeScale.cardTitle}>{item.title}</Text>
                  <Text selectable numberOfLines={2} style={[typeScale.caption, { color: palette.muted }]}>{item.detail}</Text>
                </View>
                <AppIcon color={palette.muted} name="chevron-forward" size={18} />
              </Pressable>
            </View>
          ))}
        </Surface>
        <Surface style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.8 : undefined }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: palette.primary }}>
              <Text style={{ color: palette.primaryText, fontSize: 16, fontWeight: '800' }}>
                {(user?.nickname || user?.first_name || user?.email || 'D').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={typeScale.cardTitle}>{user?.nickname || user?.first_name || copy('ผู้ใช้งาน Dishy', 'Dishy user')}</Text>
              <Text numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{user?.email || '-'}</Text>
            </View>
          </View>
          <Button icon="log-out-outline" variant="secondary" label={copy('ออกจากระบบ', 'Sign out')} onPress={signOut} />
        </Surface>
      </View>
    </AppScreen>
  );
}
