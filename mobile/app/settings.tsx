import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { AppScreen } from '@/src/components/app-shell';
import { type AppIconName } from '@/src/components/app-icon';
import { EdgeRow, EdgeSection, EdgeSectionHeader } from '@/src/components/ui';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, spacing } from '@/src/theme';

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
  const accountItems = items.filter((item) => item.href === '/settings/account' || item.href === '/settings/display');
  const managementItems = items.filter((item) => item.href === '/settings/restaurant' || item.href === '/staff');
  const restaurantItems = items.filter((item) => item.href === '/restaurants');

  function renderRows(rows: typeof items) {
    return rows.map((item) => (
      <EdgeRow
        detail={item.detail}
        icon={item.icon}
        key={item.href}
        onPress={() => router.push(item.href as never)}
        title={item.title}
      />
    ));
  }

  return (
    <AppScreen title={copy('ตั้งค่า', 'Settings')} topLevel>
      <View style={{ flexDirection: tabletWorkspace ? 'row' : 'column', alignItems: 'flex-start', gap: spacing.lg }}>
        <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 1.6 : undefined, gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <EdgeSectionHeader
              title={copy('บัญชีของคุณ', 'Your account')}
              detail={user?.email || copy('ข้อมูลส่วนตัวและการแสดงผล', 'Personal details and display')}
            />
            <EdgeSection>{renderRows(accountItems)}</EdgeSection>
          </View>

          {managementItems.length ? (
            <View style={{ gap: spacing.sm }}>
              <EdgeSectionHeader
                title={copy('การจัดการร้าน', 'Restaurant management')}
                detail={copy('ข้อมูลร้าน ทีม และสิทธิ์การใช้งาน', 'Restaurant details, team and access')}
              />
              <EdgeSection>{renderRows(managementItems)}</EdgeSection>
            </View>
          ) : null}
        </View>

        <View style={{ width: tabletWorkspace ? undefined : '100%', minWidth: 0, flex: tabletWorkspace ? 0.8 : undefined, gap: spacing.xl }}>
          <View style={{ gap: spacing.sm }}>
            <EdgeSectionHeader
              title={copy('ร้านที่ใช้งาน', 'Active restaurant')}
              detail={activeMembership?.restaurant?.name || copy('เลือกร้านหรือสาขา', 'Choose a restaurant or branch')}
            />
            <EdgeSection>{renderRows(restaurantItems)}</EdgeSection>
          </View>

          <View style={{ gap: spacing.sm }}>
            <EdgeSectionHeader title={copy('การเข้าสู่ระบบ', 'Session')} />
            <EdgeSection>
              <EdgeRow
                icon="log-out-outline"
                iconColor={palette.danger}
                onPress={signOut}
                showChevron={false}
                title={copy('ออกจากระบบ', 'Sign out')}
                titleStyle={{ color: palette.danger }}
              />
            </EdgeSection>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}
