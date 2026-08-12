import { Redirect, router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { BrandMark } from '@/src/components/brand-mark';
import { MotionReveal, useReducedMotion } from '@/src/components/motion';
import { useIsPrimaryTabsHost } from '@/src/components/primary-tabs-runtime';
import { TabSwipeGestureProvider } from '@/src/components/tab-swipe-context';
import { canUseAIAssistant } from '@/src/lib/ai-actions';
import {
  classifyHorizontalSwipe,
  getAdjacentNavigationTarget,
  shouldOpenSettings,
} from '@/src/lib/navigation-runtime';
import { orderRoutePermissions } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { breakpoints, palette, radius, spacing, typeScale } from '@/src/theme';

export type NavItem = {
  key: string;
  label: string;
  labelEn: string;
  shortLabel: string;
  shortLabelEn: string;
  href: string;
  icon: AppIconName;
  activeIcon: AppIconName;
  permission?: string;
  fallbackPermission?: string;
  permissions?: readonly string[];
  roles?: string[];
  ownerOnly?: boolean;
};

export const primaryNavigation: NavItem[] = [
  { key: 'home', label: 'ภาพรวม', labelEn: 'Overview', shortLabel: 'ภาพรวม', shortLabelEn: 'Home', href: '/home', icon: 'home-outline', activeIcon: 'home', permission: 'view_dashboard' },
  { key: 'pos', label: 'รับออเดอร์', labelEn: 'Take orders', shortLabel: 'รับออเดอร์', shortLabelEn: 'Take order', href: '/tables', icon: 'restaurant-outline', activeIcon: 'restaurant', permission: 'take_order' },
  { key: 'kitchen', label: 'ครัว', labelEn: 'Kitchen', shortLabel: 'ครัว', shortLabelEn: 'Kitchen', href: '/kitchen', icon: 'flame-outline', activeIcon: 'flame', permission: 'view_kitchen' },
  { key: 'orders', label: 'ออเดอร์', labelEn: 'Orders', shortLabel: 'ออเดอร์', shortLabelEn: 'Orders', href: '/orders', icon: 'receipt-outline', activeIcon: 'receipt', permissions: orderRoutePermissions },
  { key: 'more', label: 'ระบบทั้งหมด', labelEn: 'All tools', shortLabel: 'เพิ่มเติม', shortLabelEn: 'More', href: '/more', icon: 'ellipsis-horizontal-circle-outline', activeIcon: 'ellipsis-horizontal-circle' },
];

const managementNavigation: NavItem[] = [
  { key: 'menu', label: 'เมนูอาหาร', labelEn: 'Menu', shortLabel: 'เมนู', shortLabelEn: 'Menu', href: '/menu', icon: 'book-outline', activeIcon: 'book', permission: 'view_menu', fallbackPermission: 'manage_menu' },
  { key: 'inventory', label: 'คลังวัตถุดิบ', labelEn: 'Inventory', shortLabel: 'คลัง', shortLabelEn: 'Stock', href: '/inventory', icon: 'cube-outline', activeIcon: 'cube', permission: 'view_inventory', fallbackPermission: 'manage_inventory' },
  { key: 'tables-manage', label: 'จัดการโต๊ะ', labelEn: 'Table management', shortLabel: 'โต๊ะ', shortLabelEn: 'Tables', href: '/table-management', icon: 'grid-outline', activeIcon: 'grid', permission: 'view_tables', fallbackPermission: 'manage_table' },
  { key: 'reservations', label: 'ประวัติการจอง', labelEn: 'Reservations', shortLabel: 'การจอง', shortLabelEn: 'Bookings', href: '/reservations', icon: 'calendar-outline', activeIcon: 'calendar', permissions: ['view_tables', 'manage_table', 'take_order'] },
  { key: 'staff', label: 'พนักงาน', labelEn: 'Staff', shortLabel: 'ทีม', shortLabelEn: 'Team', href: '/staff', icon: 'people-outline', activeIcon: 'people', permission: 'manage_staff', roles: ['owner', 'manager'] },
  { key: 'reports', label: 'รายงาน', labelEn: 'Reports', shortLabel: 'รายงาน', shortLabelEn: 'Reports', href: '/reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart', permission: 'view_reports' },
  { key: 'ai', label: 'ผู้ช่วยวิเคราะห์', labelEn: 'AI assistant', shortLabel: 'AI', shortLabelEn: 'AI', href: '/ai-assistant', icon: 'sparkles-outline', activeIcon: 'sparkles', ownerOnly: true },
  { key: 'settings', label: 'ตั้งค่า', labelEn: 'Settings', shortLabel: 'ตั้งค่า', shortLabelEn: 'Settings', href: '/settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export function isAllowed(item: NavItem, membership: ReturnType<typeof useAuth>['activeMembership']) {
  if (item.ownerOnly && !canUseAIAssistant(membership?.role?.name)) return false;
  if (item.roles && !item.roles.includes(membership?.role?.name || '')) return false;
  if (item.permissions?.length) return item.permissions.some((permission) => can(membership, permission));
  if (!item.permission) return true;
  return can(membership, item.permission) || Boolean(item.fallbackPermission && can(membership, item.fallbackPermission));
}

export function isActivePath(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home';
  if (href === '/tables') return pathname === '/tables' || pathname.startsWith('/order/');
  if (href === '/more') {
    return pathname === '/more' || managementNavigation.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavigationMode = 'rail' | 'expanded';

function NavigationButton({
  item,
  mode,
  onSelect,
}: {
  item: NavItem;
  mode: NavigationMode;
  onSelect?: () => void;
}) {
  const pathname = usePathname();
  const { language } = useDisplayPreferences();
  const active = isActivePath(pathname, item.href);
  const label = language === 'th' ? item.label : item.labelEn;
  const shortLabel = language === 'th' ? item.shortLabel : item.shortLabelEn;
  const expanded = mode === 'expanded';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={() => {
        if (onSelect) {
          onSelect();
          return;
        }
        if (pathname !== item.href) router.replace(item.href as never);
      }}
      style={({ pressed }) => ({
        position: 'relative',
        minHeight: expanded ? 44 : 58,
        flexDirection: !expanded ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: !expanded ? 'center' : 'flex-start',
        gap: expanded ? spacing.md : 3,
        borderWidth: active ? 1 : 0,
        borderColor: active ? '#3A3E45' : 'transparent',
        borderRadius: radius.md,
        backgroundColor: active ? '#292C31' : 'transparent',
        paddingHorizontal: expanded ? spacing.md : spacing.xs,
        opacity: pressed ? 0.68 : 1,
      })}
    >
      <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: active ? '#34383F' : 'transparent' }}>
        <AppIcon
          color={active ? palette.accent : '#AEB6C2'}
          name={active ? item.activeIcon : item.icon}
          size={20}
        />
      </View>
      <Text numberOfLines={expanded ? 1 : 2} style={{ flex: expanded ? 1 : undefined, color: active ? '#FFFFFF' : '#AEB6C2', fontSize: expanded ? 13 : 10, lineHeight: expanded ? 18 : 13, textAlign: !expanded ? 'center' : 'left', fontWeight: active ? '700' : '600' }}>
        {expanded ? label : shortLabel}
      </Text>
    </Pressable>
  );
}

function BrandBlock({ expanded }: { expanded: boolean }) {
  return (
    <View style={{ minHeight: 64, flexDirection: expanded ? 'row' : 'column', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', gap: spacing.sm, paddingHorizontal: expanded ? spacing.sm : 0 }}>
      <BrandMark inverse showName={expanded} size={36} />
    </View>
  );
}

export function PrimaryTabletRail({
  expanded,
  onSelectPrimary,
}: {
  expanded: boolean;
  onSelectPrimary?: (item: NavItem) => void;
}) {
  const { activeMembership } = useAuth();
  const primary = primaryNavigation.filter((item) => (!expanded || item.key !== 'more') && isAllowed(item, activeMembership));
  const management = managementNavigation.filter((item) => item.key !== 'settings' && isAllowed(item, activeMembership));

  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={{ width: expanded ? 232 : 92, borderRightWidth: 1, borderRightColor: '#292C31', backgroundColor: palette.primary, paddingHorizontal: expanded ? spacing.md : spacing.sm }}>
      <BrandBlock expanded={expanded} />
      <ScrollView contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.sm }} showsVerticalScrollIndicator={false}>
        {primary.map((item) => (
          <NavigationButton
            item={item}
            key={item.key}
            mode={expanded ? 'expanded' : 'rail'}
            onSelect={onSelectPrimary ? () => onSelectPrimary(item) : undefined}
          />
        ))}
        {expanded ? (
          <>
            <View style={{ height: 1, backgroundColor: '#34383F', marginVertical: spacing.sm }} />
            {management.map((item) => <NavigationButton item={item} key={item.key} mode="expanded" />)}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const PHONE_DOCK_HEIGHT = 68;
const PHONE_MARKER_SIZE = 50;
const PHONE_MARKER_HALO_SIZE = 60;
const TAB_MOTION_EASING = Easing.bezier(0.16, 1, 0.3, 1);

export function PrimaryPhoneNavigation({
  accessibilitySelectedIndex,
  items,
  selectedIndex,
  markerPosition,
  onSelect,
}: {
  accessibilitySelectedIndex?: number;
  items: NavItem[];
  selectedIndex: number;
  markerPosition: Animated.Value;
  onSelect: (index: number) => void;
}) {
  const { copy, language } = useDisplayPreferences();
  const [dockWidth, setDockWidth] = useState(0);
  const slotWidth = items.length ? dockWidth / items.length : 0;
  const markerTranslate = Animated.multiply(markerPosition, slotWidth);
  const onDockLayout = useCallback((event: LayoutChangeEvent) => {
    setDockWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ backgroundColor: palette.canvas }}>
      <View style={{ paddingTop: 22, paddingBottom: spacing.sm }}>
        <View
          accessibilityLabel={copy('แถบนำทางหลัก ปัดหน้าจอซ้ายหรือขวาเพื่อเปลี่ยนแท็บ', 'Main navigation. Swipe the screen left or right to change tabs.')}
          accessibilityRole="tablist"
          onLayout={onDockLayout}
          style={{
            height: PHONE_DOCK_HEIGHT,
            flexDirection: 'row',
            marginHorizontal: spacing.lg,
            borderTopLeftRadius: radius.md,
            borderTopRightRadius: radius.md,
            borderBottomLeftRadius: PHONE_DOCK_HEIGHT / 2,
            borderBottomRightRadius: PHONE_DOCK_HEIGHT / 2,
            backgroundColor: palette.primary,
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 16,
            elevation: 12,
          }}
        >
          {dockWidth > 0 && selectedIndex >= 0 && selectedIndex < items.length ? (
            <Animated.View
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                width: slotWidth,
                alignItems: 'center',
                pointerEvents: 'none',
                transform: [{ translateX: markerTranslate }],
                zIndex: 2,
              }}
            >
              <View
                style={{
                  width: PHONE_MARKER_HALO_SIZE,
                  height: PHONE_MARKER_HALO_SIZE,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.full,
                  backgroundColor: palette.canvas,
                }}
              >
                <View
                  style={{
                    width: PHONE_MARKER_SIZE,
                    height: PHONE_MARKER_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.full,
                    backgroundColor: palette.accent,
                    shadowColor: '#111827',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.28,
                    shadowRadius: 5,
                    elevation: 8,
                  }}
                >
                  <AppIcon color="#FFFFFF" name={items[selectedIndex].activeIcon} size={24} />
                </View>
              </View>
            </Animated.View>
          ) : null}
          {items.map((item, index) => {
            const active = index === selectedIndex;
            const accessibilitySelected = index === (
              accessibilitySelectedIndex ?? selectedIndex
            );
            const label = language === 'th' ? item.label : item.labelEn;
            const shortLabel = language === 'th' ? item.shortLabel : item.shortLabelEn;
            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: accessibilitySelected }}
                aria-selected={accessibilitySelected}
                key={item.key}
                onPress={() => onSelect(index)}
                style={({ pressed }) => ({
                  minWidth: 48,
                  minHeight: PHONE_DOCK_HEIGHT,
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 2,
                  paddingTop: 17,
                  paddingBottom: 7,
                  paddingHorizontal: 2,
                  opacity: pressed ? 0.68 : 1,
                })}
              >
                <View style={{ height: 27, alignItems: 'center', justifyContent: 'center', opacity: active ? 0 : 1 }}>
                  <AppIcon color="#AEB6C2" name={item.icon} size={21} />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? '#FFFFFF' : '#AEB6C2',
                    fontSize: 10,
                    lineHeight: 13,
                    textAlign: 'center',
                    fontWeight: active ? '700' : '600',
                  }}
                >
                  {shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

function RestaurantBar({ detail }: { detail?: boolean }) {
  const pathname = usePathname();
  const { activeMembership, user } = useAuth();
  const { copy } = useDisplayPreferences();
  const restaurant = activeMembership?.restaurant;
  const settingsActive = !shouldOpenSettings(pathname);
  const userInitial = (user?.nickname || user?.first_name || user?.email || 'D').trim().charAt(0).toUpperCase();

  return (
    <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: spacing.md }}>
      {detail ? (
        <Pressable accessibilityLabel={copy('ย้อนกลับ', 'Go back')} accessibilityRole="button" hitSlop={4} onPress={() => router.back()} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: pressed ? palette.surfaceStrong : palette.surfaceSubtle })}>
          <AppIcon color={palette.textStrong} name="arrow-back" size={21} />
        </Pressable>
      ) : (
        <View style={{ width: 4, height: 26, borderRadius: radius.full, backgroundColor: palette.accent }} />
      )}
      <Pressable accessibilityLabel={copy('เปลี่ยนร้าน', 'Change restaurant')} accessibilityRole="button" onPress={() => router.push('/restaurants')} style={({ pressed }) => ({ minWidth: 0, minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, opacity: pressed ? 0.68 : 1 })}>
        <View style={{ minWidth: 0, flex: 1, gap: 1 }}>
          <Text numberOfLines={1} style={{ color: palette.textStrong, fontSize: 14, fontWeight: '800' }}>{restaurant?.name || 'Dishy'}</Text>
          <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11 }}>{restaurant?.branch_name || activeMembership?.role?.display_name || activeMembership?.role?.name || copy('เลือกร้าน', 'Choose restaurant')}</Text>
        </View>
        <AppIcon color={palette.muted} name="chevron-down" size={16} />
      </Pressable>
      <Pressable accessibilityLabel={copy('เปิดบัญชีและการตั้งค่า', 'Open account and settings')} accessibilityRole="button" accessibilityState={{ selected: settingsActive }} onPress={() => { if (!settingsActive) router.push('/settings'); }} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: settingsActive ? palette.accentMuted : palette.borderStrong, borderRadius: radius.full, backgroundColor: settingsActive ? palette.accentSoft : palette.surface, opacity: pressed ? 0.7 : 1 })}>
        <Text allowFontScaling={false} style={{ color: settingsActive ? palette.accent : palette.textStrong, fontSize: 14, fontWeight: '800' }}>{userInitial}</Text>
      </Pressable>
    </View>
  );
}

function ScreenHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ minWidth: 0, flex: 1, gap: spacing.xs }}>
        <Text accessibilityRole="header" selectable style={typeScale.hero}>{title}</Text>
        {subtitle ? <Text selectable style={[typeScale.body, { color: palette.muted }]}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={{ paddingTop: 1 }}>{action}</View> : null}
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
  footer,
  contentStyle,
  contentMaxWidth,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  topLevel?: boolean;
  action?: React.ReactNode;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  scroll?: boolean;
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  contentMaxWidth?: number;
}) {
  const { width } = useWindowDimensions();
  const { status, user, activeMembership } = useAuth();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const embeddedInPrimaryTabs = useIsPrimaryTabsHost();
  const isTablet = width >= breakpoints.tablet;
  const expandedRail = width >= breakpoints.expandedRail;
  const horizontalPadding = isTablet ? spacing.xxl : spacing.lg;
  const maxWidth = contentMaxWidth || (isTablet ? 1180 : 720);
  const phoneNavigationItems = useMemo(
    () => primaryNavigation.filter((item) => isAllowed(item, activeMembership)),
    [activeMembership],
  );
  const activeTabIndex = phoneNavigationItems.findIndex((item) =>
    isActivePath(pathname, item.href),
  );
  const markerPosition = useRef(
    new Animated.Value(Math.max(activeTabIndex, 0)),
  ).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const navigationLocked = useRef(false);
  const nestedHorizontalGestureActive = useRef(false);
  const navigationFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedTabIndex, setSelectedTabIndex] = useState(activeTabIndex);
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (navigationFallbackTimer.current) {
      clearTimeout(navigationFallbackTimer.current);
      navigationFallbackTimer.current = null;
    }
    navigationLocked.current = false;
    nestedHorizontalGestureActive.current = false;
    contentTranslateX.setValue(0);
    contentOpacity.setValue(1);
    setSelectedTabIndex(activeTabIndex);
    if (activeTabIndex >= 0) markerPosition.setValue(activeTabIndex);
  }, [activeTabIndex, contentOpacity, contentTranslateX, markerPosition, pathname]);

  useEffect(
    () => () => {
      if (navigationFallbackTimer.current) {
        clearTimeout(navigationFallbackTimer.current);
        navigationFallbackTimer.current = null;
      }
      markerPosition.stopAnimation();
      contentTranslateX.stopAnimation();
      contentOpacity.stopAnimation();
    },
    [contentOpacity, contentTranslateX, markerPosition],
  );

  const resetTabDrag = useCallback(() => {
    if (navigationFallbackTimer.current) {
      clearTimeout(navigationFallbackTimer.current);
      navigationFallbackTimer.current = null;
    }
    setSelectedTabIndex(activeTabIndex);
    if (reducedMotion) {
      contentTranslateX.setValue(0);
      contentOpacity.setValue(1);
      if (activeTabIndex >= 0) markerPosition.setValue(activeTabIndex);
      navigationLocked.current = false;
      return;
    }

    Animated.parallel([
      Animated.timing(contentTranslateX, {
        toValue: 0,
        duration: 170,
        easing: TAB_MOTION_EASING,
        useNativeDriver,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 140,
        easing: TAB_MOTION_EASING,
        useNativeDriver,
      }),
      ...(activeTabIndex >= 0
        ? [Animated.timing(markerPosition, {
          toValue: activeTabIndex,
          duration: 170,
          easing: TAB_MOTION_EASING,
          useNativeDriver,
        })]
        : []),
    ]).start(() => {
      navigationLocked.current = false;
    });
  }, [activeTabIndex, contentOpacity, contentTranslateX, markerPosition, reducedMotion, useNativeDriver]);

  const setNestedHorizontalGestureActive = useCallback((active: boolean) => {
    nestedHorizontalGestureActive.current = active;
  }, []);

  const navigateToTab = useCallback((targetIndex: number) => {
    const target = phoneNavigationItems[targetIndex];
    if (!target || navigationLocked.current) return;

    if (targetIndex === activeTabIndex) {
      if (pathname !== target.href) router.replace(target.href as never);
      return;
    }

    if (activeTabIndex < 0 || reducedMotion) {
      setSelectedTabIndex(targetIndex);
      markerPosition.setValue(targetIndex);
      contentTranslateX.setValue(0);
      contentOpacity.setValue(1);
      router.replace(target.href as never);
      return;
    }

    navigationLocked.current = true;
    setSelectedTabIndex(targetIndex);
    const direction = targetIndex > activeTabIndex ? 1 : -1;
    const exitDistance = Math.min(width * 0.42, 168);

    Animated.parallel([
      Animated.timing(markerPosition, {
        toValue: targetIndex,
        duration: 220,
        easing: TAB_MOTION_EASING,
        useNativeDriver,
      }),
      Animated.timing(contentTranslateX, {
        toValue: -direction * exitDistance,
        duration: 200,
        easing: TAB_MOTION_EASING,
        useNativeDriver,
      }),
      Animated.timing(contentOpacity, {
        toValue: 0.92,
        duration: 160,
        easing: TAB_MOTION_EASING,
        useNativeDriver,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        resetTabDrag();
        return;
      }
      navigationFallbackTimer.current = setTimeout(() => {
        navigationFallbackTimer.current = null;
        resetTabDrag();
      }, 450);
      router.replace(target.href as never);
    });
  }, [activeTabIndex, contentOpacity, contentTranslateX, markerPosition, pathname, phoneNavigationItems, reducedMotion, resetTabDrag, useNativeDriver, width]);

  const tabSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (
        embeddedInPrimaryTabs ||
        !topLevel ||
        isTablet ||
        navigationLocked.current ||
        nestedHorizontalGestureActive.current ||
        activeTabIndex < 0 ||
        phoneNavigationItems.length < 2 ||
        gesture.numberActiveTouches !== 1
      ) {
        return false;
      }
      const horizontalDistance = Math.abs(gesture.dx);
      const verticalDistance = Math.abs(gesture.dy);
      return horizontalDistance >= 10 && horizontalDistance > verticalDistance * 1.35;
    },
    onPanResponderGrant: () => {
      contentTranslateX.stopAnimation();
      contentOpacity.stopAnimation();
      markerPosition.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      if (reducedMotion || activeTabIndex < 0) return;
      const direction = gesture.dx < 0 ? 1 : -1;
      const adjacent = getAdjacentNavigationTarget(
        phoneNavigationItems,
        activeTabIndex,
        direction,
      );
      const resistance = adjacent ? 1 : 0.18;
      const maxDrag = width * 0.42;
      const resistedDrag = gesture.dx * resistance;
      const drag = Math.max(-maxDrag, Math.min(maxDrag, resistedDrag));
      const markerProgress = activeTabIndex - drag / Math.max(width, 1);
      const boundedMarker = Math.max(
        0,
        Math.min(phoneNavigationItems.length - 1, markerProgress),
      );

      contentTranslateX.setValue(drag);
      contentOpacity.setValue(1 - Math.min(Math.abs(drag) / Math.max(width * 8, 1), 0.05));
      markerPosition.setValue(boundedMarker);
    },
    onPanResponderRelease: (_, gesture) => {
      const direction = classifyHorizontalSwipe({
        deltaX: gesture.dx,
        deltaY: gesture.dy,
        velocityX: gesture.vx * 1000,
      });
      const target = direction
        ? getAdjacentNavigationTarget(
          phoneNavigationItems,
          activeTabIndex,
          direction,
        )
        : null;

      if (!target) {
        resetTabDrag();
        return;
      }
      navigateToTab(target.index);
    },
    onPanResponderTerminate: resetTabDrag,
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
  }), [activeTabIndex, contentOpacity, contentTranslateX, embeddedInPrimaryTabs, isTablet, markerPosition, navigateToTab, phoneNavigationItems, reducedMotion, resetTabDrag, topLevel, width]);

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: palette.canvas }} />;
  if (!user) return <Redirect href="/login" />;
  if (!activeMembership) return <Redirect href="/restaurants" />;

  const heading = (
    <MotionReveal>
      <ScreenHeading title={title} subtitle={subtitle} action={action} />
    </MotionReveal>
  );
  const main = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: horizontalPadding, paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      <View style={[{ width: '100%', maxWidth, gap: spacing.xl }, contentStyle]}>
        {heading}
        {children}
      </View>
    </ScrollView>
  ) : (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: horizontalPadding, paddingTop: spacing.lg }}>
      <View style={[{ width: '100%', maxWidth, flex: 1, gap: spacing.lg }, contentStyle]}>
        {heading}
        <View style={{ minHeight: 0, flex: 1 }}>{children}</View>
      </View>
    </View>
  );

  const animatedContent = (
    <Animated.View
      {...(topLevel && !isTablet && !embeddedInPrimaryTabs ? tabSwipeResponder.panHandlers : {})}
      style={{
        minHeight: 0,
        flex: 1,
        opacity: contentOpacity,
        transform: [{ translateX: contentTranslateX }],
      }}
    >
      <SafeAreaView edges={isTablet ? ['top', 'right'] : ['top', 'left', 'right']} style={{ backgroundColor: palette.surface }}>
        <RestaurantBar detail={!topLevel} />
      </SafeAreaView>
      {main}
      {footer ? <SafeAreaView edges={isTablet ? ['right', 'bottom'] : ['left', 'right', 'bottom']} style={{ backgroundColor: palette.surface }}>{footer}</SafeAreaView> : null}
    </Animated.View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      {embeddedInPrimaryTabs ? animatedContent : (
        <TabSwipeGestureProvider setNestedHorizontalGestureActive={setNestedHorizontalGestureActive}>
          {animatedContent}
        </TabSwipeGestureProvider>
      )}
      {topLevel && !isTablet && !embeddedInPrimaryTabs ? (
        <PrimaryPhoneNavigation
          items={phoneNavigationItems}
          markerPosition={markerPosition}
          onSelect={navigateToTab}
          selectedIndex={selectedTabIndex}
        />
      ) : null}
    </View>
  );

  if (!isTablet || embeddedInPrimaryTabs) return content;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.canvas }}>
      <PrimaryTabletRail expanded={expandedRail} />
      <View style={{ minWidth: 0, flex: 1 }}>{content}</View>
    </View>
  );
}

export const appNavigation = { primaryNavigation, managementNavigation, isAllowed };
