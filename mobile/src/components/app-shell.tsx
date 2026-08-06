import { Redirect, router, usePathname } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '@/src/components/app-text';
import { canUseAIAssistant } from '@/src/lib/ai-actions';
import { shouldOpenSettings } from '@/src/lib/navigation-runtime';
import { orderRoutePermissions } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

type NavItem = {
  key: string;
  label: string;
  labelEn: string;
  shortLabel: string;
  shortLabelEn: string;
  href: string;
  mark: string;
  permission?: string;
  fallbackPermission?: string;
  permissions?: readonly string[];
  roles?: string[];
  ownerOnly?: boolean;
};

const primaryNavigation: NavItem[] = [
  { key: 'home', label: 'ภาพรวม', labelEn: 'Overview', shortLabel: 'ภาพรวม', shortLabelEn: 'Home', href: '/home', mark: 'ภ', permission: 'view_dashboard' },
  { key: 'pos', label: 'รับออเดอร์', labelEn: 'Take orders', shortLabel: 'รับออเดอร์', shortLabelEn: 'Order taking', href: '/tables', mark: 'ร', permission: 'take_order' },
  { key: 'kitchen', label: 'ครัว', labelEn: 'Kitchen', shortLabel: 'ครัว', shortLabelEn: 'Kitchen', href: '/kitchen', mark: 'ค', permission: 'view_kitchen' },
  { key: 'orders', label: 'ออเดอร์', labelEn: 'Orders', shortLabel: 'ออเดอร์', shortLabelEn: 'Orders', href: '/orders', mark: 'อ', permissions: orderRoutePermissions },
  { key: 'more', label: 'ระบบทั้งหมด', labelEn: 'All tools', shortLabel: 'เพิ่มเติม', shortLabelEn: 'More', href: '/more', mark: '•••' },
];

const managementNavigation: NavItem[] = [
  { key: 'menu', label: 'เมนูอาหาร', labelEn: 'Menu', shortLabel: 'เมนู', shortLabelEn: 'Menu', href: '/menu', mark: 'ม', permission: 'view_menu', fallbackPermission: 'manage_menu' },
  { key: 'inventory', label: 'คลังวัตถุดิบ', labelEn: 'Inventory', shortLabel: 'คลัง', shortLabelEn: 'Stock', href: '/inventory', mark: 'ว', permission: 'view_inventory', fallbackPermission: 'manage_inventory' },
  { key: 'tables-manage', label: 'จัดการโต๊ะ', labelEn: 'Table management', shortLabel: 'โต๊ะ', shortLabelEn: 'Tables', href: '/table-management', mark: 'ต', permission: 'view_tables', fallbackPermission: 'manage_table' },
  { key: 'reservations', label: 'ประวัติการจอง', labelEn: 'Reservations', shortLabel: 'การจอง', shortLabelEn: 'Bookings', href: '/reservations', mark: 'จ', permissions: ['view_tables', 'manage_table', 'take_order'] },
  { key: 'staff', label: 'พนักงาน', labelEn: 'Staff', shortLabel: 'ทีม', shortLabelEn: 'Team', href: '/staff', mark: 'ท', permission: 'manage_staff', roles: ['owner', 'manager'] },
  { key: 'reports', label: 'รายงาน', labelEn: 'Reports', shortLabel: 'รายงาน', shortLabelEn: 'Reports', href: '/reports', mark: 'ร', permission: 'view_reports' },
  { key: 'ai', label: 'ผู้ช่วยวิเคราะห์', labelEn: 'AI assistant', shortLabel: 'AI', shortLabelEn: 'AI', href: '/ai-assistant', mark: 'AI', ownerOnly: true },
  { key: 'settings', label: 'ตั้งค่า', labelEn: 'Settings', shortLabel: 'ตั้งค่า', shortLabelEn: 'Settings', href: '/settings', mark: 'ต' },
];

function isAllowed(item: NavItem, membership: ReturnType<typeof useAuth>['activeMembership']) {
  if (item.ownerOnly && !canUseAIAssistant(membership?.role?.name)) return false;
  if (item.roles && !item.roles.includes(membership?.role?.name || '')) return false;
  if (item.permissions?.length) {
    return item.permissions.some((permission) => can(membership, permission));
  }
  if (!item.permission) return true;
  return can(membership, item.permission) || Boolean(item.fallbackPermission && can(membership, item.fallbackPermission));
}

function isActivePath(pathname: string, href: string) {
  const target = String(href);
  if (target === '/home') return pathname === '/home';
  if (target === '/tables') return pathname === '/tables' || pathname.startsWith('/order/');
  if (target === '/more') return pathname === '/more';
  return pathname === target || pathname.startsWith(`${target}/`);
}

function NavigationButton({ item, compact }: { item: NavItem; compact?: boolean }) {
  const pathname = usePathname();
  const { language } = useDisplayPreferences();
  const active = isActivePath(pathname, item.href);
  const label = language === 'th' ? item.label : item.labelEn;
  const shortLabel = language === 'th' ? item.shortLabel : item.shortLabelEn;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={() => {
        if (!active) router.replace(item.href as never);
      }}
      style={({ pressed }) => ({
        minHeight: compact ? 54 : 46,
        minWidth: compact ? 52 : undefined,
        flex: compact ? 1 : undefined,
        flexDirection: compact ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'flex-start',
        gap: compact ? 3 : spacing.md,
        borderWidth: active && !compact ? 1 : 0,
        borderColor: palette.border,
        borderRadius: radius.md,
        backgroundColor: active ? palette.surface : 'transparent',
        paddingHorizontal: compact ? spacing.xs : spacing.md,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View style={{ minWidth: compact ? 22 : 28, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: active ? palette.accentSoft : palette.surfaceStrong }}>
        <Text allowFontScaling={false} style={{ color: active ? palette.accent : palette.muted, fontSize: item.mark.length > 2 ? 9 : 12, fontWeight: '800' }}>{item.mark}</Text>
      </View>
      <Text numberOfLines={2} style={{ color: active ? palette.textStrong : palette.muted, fontSize: compact ? 10 : 13, lineHeight: compact ? 14 : 18, textAlign: compact ? 'center' : 'left', fontWeight: active ? '700' : '600' }}>
        {compact ? shortLabel : label}
      </Text>
    </Pressable>
  );
}

function TabletRail() {
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const primary = primaryNavigation.filter((item) => item.key !== 'more' && isAllowed(item, activeMembership));
  const management = managementNavigation.filter((item) => isAllowed(item, activeMembership));
  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={{ width: 220, borderRightWidth: 1, borderRightColor: palette.border, backgroundColor: '#F1F5F9', padding: spacing.md }}>
      <View style={{ minHeight: 62, justifyContent: 'center', gap: 2, paddingHorizontal: spacing.sm }}>
        <Text style={{ color: palette.textStrong, fontSize: 16, fontWeight: '800' }}>Dishy</Text>
        <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>{copy('ศูนย์งานระหว่างกะ', 'SHIFT CONSOLE')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.sm }} showsVerticalScrollIndicator={false}>
        {primary.map((item) => <NavigationButton item={item} key={item.key} />)}
        <View style={{ height: 1, backgroundColor: palette.border, marginVertical: spacing.sm }} />
        {management.map((item) => <NavigationButton item={item} key={item.key} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

function PhoneNavigation() {
  const { activeMembership } = useAuth();
  const items = primaryNavigation.filter((item) => isAllowed(item, activeMembership));
  return (
    <SafeAreaView edges={['bottom']} style={{ borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface }}>
      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, paddingTop: spacing.xs }}>
        {items.map((item) => <NavigationButton compact item={item} key={item.key} />)}
      </View>
    </SafeAreaView>
  );
}

function RestaurantBar({ detail }: { detail?: boolean }) {
  const pathname = usePathname();
  const { activeMembership } = useAuth();
  const { copy } = useDisplayPreferences();
  const restaurant = activeMembership?.restaurant;
  const settingsActive = !shouldOpenSettings(pathname);
  return (
    <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: spacing.lg }}>
      {detail ? (
        <Pressable accessibilityLabel={copy('ย้อนกลับ', 'Go back')} onPress={() => router.back()} style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700' }}>‹</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => router.push('/restaurants')} style={{ minWidth: 0, flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.textStrong, fontSize: 14, fontWeight: '700' }}>{restaurant?.name || 'Dishy'}</Text>
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11 }}>{restaurant?.branch_name || activeMembership?.role?.display_name || activeMembership?.role?.name || copy('เลือกร้าน', 'Choose restaurant')}</Text>
      </Pressable>
      <Pressable accessibilityLabel={copy('เปิดการตั้งค่า', 'Open settings')} accessibilityRole="button" accessibilityState={{ selected: settingsActive }} onPress={() => { if (!settingsActive) router.push('/settings'); }} style={({ pressed }) => ({ minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>{copy('บัญชี', 'Account')}</Text>
      </Pressable>
    </View>
  );
}

export function AppScreen({
  title,
  subtitle,
  children,
  topLevel = true,
  action,
  refreshControl,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  topLevel?: boolean;
  action?: React.ReactNode;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  scroll?: boolean;
}) {
  const { width } = useWindowDimensions();
  const { status, user, activeMembership } = useAuth();
  const isTablet = width >= 768;

  if (status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: palette.canvas }} />;
  }
  if (!user) return <Redirect href="/login" />;
  if (!activeMembership) return <Redirect href="/restaurants" />;

  const content = (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <SafeAreaView edges={['top', 'right']} style={{ backgroundColor: palette.surface }}>
        <RestaurantBar detail={!topLevel} />
      </SafeAreaView>
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: isTablet ? spacing.xxl : spacing.lg, paddingTop: spacing.xl, paddingBottom: topLevel && !isTablet ? 108 : spacing.xxxl }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          <View style={{ width: '100%', maxWidth: isTablet ? 1100 : 720, gap: spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
                <Text selectable style={typeScale.hero}>{title}</Text>
                {subtitle ? <Text selectable style={[typeScale.body, { color: palette.muted }]}>{subtitle}</Text> : null}
              </View>
              {action}
            </View>
            {children}
          </View>
        </ScrollView>
      ) : children}
      {topLevel && !isTablet ? <PhoneNavigation /> : null}
    </View>
  );

  if (!isTablet) return content;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.canvas }}>
      <TabletRail />
      <View style={{ flex: 1 }}>{content}</View>
    </View>
  );
}

export const appNavigation = { primaryNavigation, managementNavigation, isAllowed };
