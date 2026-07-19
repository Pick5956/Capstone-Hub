import { Redirect, router, usePathname } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

type NavItem = {
  key: string;
  label: string;
  shortLabel: string;
  href: string;
  mark: string;
  permission?: string;
  fallbackPermission?: string;
};

const primaryNavigation: NavItem[] = [
  { key: 'home', label: 'ภาพรวม', shortLabel: 'ภาพรวม', href: '/home', mark: 'ภ' },
  { key: 'pos', label: 'รับออเดอร์', shortLabel: 'รับออเดอร์', href: '/tables', mark: 'ร', permission: 'view_tables', fallbackPermission: 'take_order' },
  { key: 'kitchen', label: 'ครัว', shortLabel: 'ครัว', href: '/kitchen', mark: 'ค', permission: 'view_kitchen', fallbackPermission: 'update_order_status' },
  { key: 'orders', label: 'ออเดอร์', shortLabel: 'ออเดอร์', href: '/orders', mark: 'อ', permission: 'view_orders' },
  { key: 'more', label: 'ระบบทั้งหมด', shortLabel: 'เพิ่มเติม', href: '/more', mark: '•••' },
];

const managementNavigation: NavItem[] = [
  { key: 'menu', label: 'เมนูอาหาร', shortLabel: 'เมนู', href: '/menu', mark: 'ม', permission: 'manage_menu' },
  { key: 'inventory', label: 'คลังวัตถุดิบ', shortLabel: 'คลัง', href: '/inventory', mark: 'ว', permission: 'view_inventory', fallbackPermission: 'manage_inventory' },
  { key: 'tables-manage', label: 'จัดการโต๊ะ', shortLabel: 'โต๊ะ', href: '/table-management', mark: 'ต', permission: 'manage_table' },
  { key: 'staff', label: 'พนักงาน', shortLabel: 'ทีม', href: '/staff', mark: 'ท', permission: 'manage_staff' },
  { key: 'reports', label: 'รายงาน', shortLabel: 'รายงาน', href: '/reports', mark: 'ร', permission: 'view_reports' },
  { key: 'ai', label: 'ผู้ช่วยวิเคราะห์', shortLabel: 'AI', href: '/ai-assistant', mark: 'AI', permission: 'view_reports' },
  { key: 'settings', label: 'ตั้งค่า', shortLabel: 'ตั้งค่า', href: '/settings', mark: 'ต' },
];

function isAllowed(item: NavItem, membership: ReturnType<typeof useAuth>['activeMembership']) {
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
  const active = isActivePath(pathname, item.href);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
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
        <Text style={{ color: active ? palette.accent : palette.muted, fontSize: item.mark.length > 2 ? 9 : 12, fontWeight: '800' }}>{item.mark}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: active ? palette.textStrong : palette.muted, fontSize: compact ? 10 : 13, fontWeight: active ? '700' : '600' }}>
        {compact ? item.shortLabel : item.label}
      </Text>
    </Pressable>
  );
}

function TabletRail() {
  const { activeMembership } = useAuth();
  const primary = primaryNavigation.filter((item) => item.key !== 'more' && isAllowed(item, activeMembership));
  const management = managementNavigation.filter((item) => isAllowed(item, activeMembership));
  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={{ width: 220, borderRightWidth: 1, borderRightColor: palette.border, backgroundColor: '#F1F5F9', padding: spacing.md }}>
      <View style={{ minHeight: 62, justifyContent: 'center', gap: 2, paddingHorizontal: spacing.sm }}>
        <Text style={{ color: palette.textStrong, fontSize: 16, fontWeight: '800' }}>Restaurant Hub</Text>
        <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>SHIFT CONSOLE</Text>
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
  const { activeMembership } = useAuth();
  const restaurant = activeMembership?.restaurant;
  return (
    <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: spacing.lg }}>
      {detail ? (
        <Pressable accessibilityLabel="ย้อนกลับ" onPress={() => router.back()} style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: palette.text, fontSize: 20, fontWeight: '700' }}>‹</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => router.push('/restaurants')} style={{ minWidth: 0, flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ color: palette.textStrong, fontSize: 14, fontWeight: '700' }}>{restaurant?.name || 'Restaurant Hub'}</Text>
        <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11 }}>{restaurant?.branch_name || activeMembership?.role?.display_name || activeMembership?.role?.name || 'เลือกร้าน'}</Text>
      </Pressable>
      <Pressable accessibilityLabel="เปิดการตั้งค่า" onPress={() => router.push('/settings')} style={({ pressed }) => ({ minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: palette.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>บัญชี</Text>
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
