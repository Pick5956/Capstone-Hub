import { Redirect } from 'expo-router';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { can } from '@/src/lib/rbac';
import { getWorkModeCopy } from '@/src/lib/work-mode';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

const actions: Array<{
  key: string;
  label: string;
  href?: Href;
  permission: string;
  fallback?: string;
}> = [
  { key: 'tables', label: 'โต๊ะ', href: '/tables', permission: 'view_tables', fallback: 'take_order' },
  { key: 'orders', label: 'ออเดอร์', href: '/orders', permission: 'view_orders' },
  { key: 'kitchen', label: 'ครัว', href: '/kitchen', permission: 'view_kitchen', fallback: 'update_order_status' },
  { key: 'menu', label: 'เมนู', href: '/menu', permission: 'manage_menu', fallback: 'view_menu' },
  { key: 'reports', label: 'รายงาน', permission: 'view_reports' },
  { key: 'staff', label: 'พนักงาน', permission: 'manage_staff' },
  { key: 'settings', label: 'ตั้งค่า', permission: 'manage_table' },
];

export default function HomeScreen() {
  const { activeMembership, signOut, user } = useAuth();

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!activeMembership) {
    return <Redirect href="/restaurants" />;
  }

  const restaurant = activeMembership.restaurant;
  const roleName = activeMembership.role?.name ?? 'staff';
  const workMode = getWorkModeCopy(activeMembership);
  const availableActions = actions.filter((action) => {
    return can(activeMembership, action.permission) || can(activeMembership, action.fallback || action.permission);
  });

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={layout.scrollContainer}>
      <View style={layout.headerRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable style={typeScale.kicker}>RESTAURANT HUB</Text>
          <Text selectable style={typeScale.hero}>{restaurant?.name || 'ร้านของคุณ'}</Text>
          <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
            {restaurant?.branch_name || 'ไม่มีชื่อสาขา'} · {roleName}
          </Text>
        </View>
        <Pressable onPress={signOut} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>ออก</Text>
        </Pressable>
      </View>

      <View style={layout.panel}>
        <Text selectable style={typeScale.title}>{workMode.title}</Text>
        <Text selectable style={[typeScale.body, { color: colors.muted }]}>
          {workMode.hint}
        </Text>
      </View>

      <View style={layout.grid}>
        {availableActions.map((action) => (
          <Pressable
            key={action.key}
            onPress={() => action.href ? router.push(action.href) : undefined}
            style={({ pressed }) => [layout.tile, pressed && { borderColor: colors.primary }]}
          >
            <Text selectable style={typeScale.cardTitle}>{action.label}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              {action.href ? 'ดึงข้อมูลจาก backend เดิม' : 'กำลังทำต่อ'}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
