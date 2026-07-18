import { Redirect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AuthScreen } from '@/src/components/auth-screen';
import { Button, EmptyState, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { useAuth } from '@/src/providers/auth-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';

export default function RestaurantsScreen() {
  const { activeMembership, memberships, selectRestaurant, user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <AuthScreen title="เลือกร้านที่จะทำงาน" subtitle="ร้านและสิทธิ์ของคุณจากบัญชีเดียวกับเว็บ"><Surface><SectionHeader title="ร้านของฉัน" detail={`${memberships.length} ร้านที่เข้าถึงได้`} />{memberships.map((membership) => { const active = activeMembership?.restaurant_id === membership.restaurant_id; return <Pressable key={membership.ID} onPress={() => selectRestaurant(membership)} style={({ pressed }) => ({ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: active ? palette.primary : palette.border, borderRadius: radius.md, backgroundColor: active ? palette.accentSoft : palette.surface, padding: spacing.md, opacity: pressed ? 0.74 : 1 })}><View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: palette.primary }}><Text style={{ color: palette.primaryText, fontWeight: '800' }}>{(membership.restaurant?.name || 'R').slice(0, 1)}</Text></View><View style={{ minWidth: 0, flex: 1, gap: 2 }}><Text selectable numberOfLines={1} style={typeScale.cardTitle}>{membership.restaurant?.name || `ร้าน #${membership.restaurant_id}`}</Text><Text selectable numberOfLines={1} style={[typeScale.caption, { color: palette.muted }]}>{membership.restaurant?.branch_name || 'สาขาหลัก'} · {membership.role?.display_name || membership.role?.name || 'พนักงาน'}</Text></View>{active ? <StatusBadge label="ร้านปัจจุบัน" tone="success" /> : <Text style={{ color: palette.muted, fontSize: 20 }}>›</Text>}</Pressable>; })}{!memberships.length ? <EmptyState title="ยังไม่มีร้าน" detail="สร้างร้านใหม่หรือวางลิงก์คำเชิญจากเจ้าของร้าน" /> : null}</Surface><Surface><Button label="สร้างร้านใหม่" onPress={() => router.push('/create-restaurant' as never)} /><Button variant="secondary" label="รับคำเชิญพนักงาน" onPress={() => router.push('/invite/manual' as never)} /></Surface></AuthScreen>;
}
