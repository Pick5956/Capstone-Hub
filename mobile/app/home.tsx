import { Redirect, router } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MotionPressable, MotionView } from '@/src/components/motion';
import { can } from '@/src/lib/rbac';
import { getWorkModeCopy } from '@/src/lib/work-mode';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

const actions: Array<{
  key: string;
  label: string;
  href: string;
  permission: string;
  fallback?: string;
  detail: string;
}> = [
  { key: 'tables', label: 'รับออเดอร์', href: '/tables', permission: 'view_tables', fallback: 'take_order', detail: 'เปิดโต๊ะและส่งอาหารเข้าครัว' },
  { key: 'orders', label: 'ออเดอร์', href: '/orders', permission: 'view_orders', detail: 'ดูออเดอร์และสถานะโต๊ะ' },
  { key: 'kitchen', label: 'ครัว', href: '/kitchen', permission: 'view_kitchen', fallback: 'update_order_status', detail: 'จัดคิวอาหารและทำเสร็จ' },
  { key: 'menu', label: 'เมนูอาหาร', href: '/menu', permission: 'view_menu', fallback: 'manage_menu', detail: 'ดู/สร้าง/แก้ไขเมนูและหมวด' },
  { key: 'table-management', label: 'ผังโต๊ะ', href: '/table-management', permission: 'manage_table', detail: 'สร้าง/แก้ไขโต๊ะ โซน tag และ QR' },
  { key: 'staff', label: 'พนักงาน', href: '/staff', permission: 'manage_staff', detail: 'เชิญพนักงานและจัดสิทธิ์' },
  { key: 'settings', label: 'ตั้งค่าร้าน', href: '/settings', permission: 'manage_table', detail: 'ข้อมูลร้าน ภาษี และค่าบริการ' },
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
        <Pressable onPress={() => router.replace('/restaurants')} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>ร้าน</Text>
        </Pressable>
        <Pressable onPress={signOut} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>ออก</Text>
        </Pressable>
      </View>

      <MotionView delay={60} style={layout.panel}>
        <Text selectable style={typeScale.title}>{workMode.title}</Text>
        <Text selectable style={[typeScale.body, { color: colors.muted }]}>
          {workMode.hint}
        </Text>
      </MotionView>

      <View style={layout.grid}>
        {availableActions.map((action, index) => (
          <MotionPressable
            key={action.key}
            delay={90 + index * 35}
            onPress={() => router.push(action.href as Href)}
            style={({ pressed }) => [layout.tile, pressed && { borderColor: colors.primary }]}
          >
            <Text selectable style={typeScale.cardTitle}>{action.label}</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>{action.detail}</Text>
          </MotionPressable>
        ))}
      </View>
    </ScrollView>
  );
}
