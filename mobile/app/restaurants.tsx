import { Redirect } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';

export default function RestaurantsScreen() {
  const { activeMembership, memberships, selectRestaurant, user } = useAuth();

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (activeMembership) {
    return <Redirect href="/home" />;
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={layout.scrollContainer}>
      <View style={{ gap: 8 }}>
        <Text selectable style={typeScale.kicker}>RESTAURANTS</Text>
        <Text selectable style={typeScale.hero}>เลือกร้านที่จะทำงาน</Text>
        <Text selectable style={[typeScale.body, { color: colors.muted }]}>
          แอพจะส่ง X-Restaurant-ID ให้ backend ทุกครั้งหลังเลือกร้าน
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        {memberships.map((membership) => {
          const restaurant = membership.restaurant;
          const role = membership.role?.name ?? 'staff';
          return (
            <Pressable
              key={membership.ID}
              onPress={() => selectRestaurant(membership)}
              style={({ pressed }) => [
                layout.card,
                pressed && { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text selectable style={typeScale.cardTitle}>
                  {restaurant?.name || `ร้าน #${membership.restaurant_id}`}
                </Text>
                <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
                  {restaurant?.branch_name || 'ไม่มีชื่อสาขา'} · {role}
                </Text>
              </View>
              <Text selectable style={[typeScale.caption, { color: colors.primary, fontWeight: '800' }]}>
                เลือก
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
