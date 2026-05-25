import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { MobileScreen } from '@/src/components/mobile-screen';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

export default function RestaurantsScreen() {
  const { activeMembership, memberships, selectRestaurant, user } = useAuth();

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <MobileScreen
      kicker="RESTAURANTS"
      title="เลือกร้านที่จะทำงาน"
      subtitle="เลือกร้านก่อนเข้าทำงาน เหมือนเว็บหลัก และกลับมาเปลี่ยนร้านได้ทุกเมื่อ"
      showBack={false}
    >
      <View style={layout.panel}>
        <Pressable onPress={() => router.push('/create-restaurant' as never)} style={layout.primaryButton}>
          <Text style={layout.primaryButtonText}>+ สร้างร้านใหม่</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/invite/manual' as never)} style={layout.secondaryButton}>
          <Text style={layout.secondaryButtonText}>รับคำเชิญพนักงาน</Text>
        </Pressable>
      </View>

      <View style={{ gap: 10 }}>
        {memberships.length === 0 ? (
          <View style={layout.panel}>
            <Text selectable style={typeScale.cardTitle}>ยังไม่มีร้าน</Text>
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              สร้างร้านใหม่หรือรับคำเชิญจากเจ้าของร้านเพื่อเริ่มใช้งาน
            </Text>
          </View>
        ) : null}
        {memberships.map((membership) => {
          const restaurant = membership.restaurant;
          const role = membership.role?.name ?? 'staff';
          const isActive = activeMembership?.restaurant_id === membership.restaurant_id;
          return (
            <Pressable
              key={membership.ID}
              onPress={() => selectRestaurant(membership)}
              style={({ pressed }) => [
                layout.card,
                (pressed || isActive) && { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text selectable style={typeScale.cardTitle}>
                  {restaurant?.name || `ร้าน #${membership.restaurant_id}`}
                </Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {restaurant?.branch_name || 'ไม่มีชื่อสาขา'} · {role}{isActive ? ' · กำลังใช้งาน' : ''}
                </Text>
              </View>
              <Text selectable style={[typeScale.caption, { color: colors.primary, fontWeight: '800' }]}>
                {isActive ? 'เปิดร้านนี้' : 'เลือก'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </MobileScreen>
  );
}
