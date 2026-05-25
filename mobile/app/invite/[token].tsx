import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { acceptInvitation, getInvitationByToken } from '@/src/api/restaurant';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { useAuth } from '@/src/providers/auth-provider';
import { colors, layout, typeScale } from '@/src/theme';
import type { Invitation } from '@/src/types/restaurant';

export default function InviteTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { refreshMemberships, setActiveRestaurantFromMembership, user } = useAuth();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [usable, setUsable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const response = await getInvitationByToken(token);
      setInvitation(response.invitation);
      setUsable(response.usable);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดคำเชิญไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!token) return <Redirect href="/restaurants" />;

  async function accept() {
    if (!user) {
      router.push('/login');
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      const response = await acceptInvitation(token);
      await refreshMemberships();
      await setActiveRestaurantFromMembership(response.membership);
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'รับคำเชิญไม่สำเร็จ');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <MobileScreen
      kicker="INVITE"
      title="คำเชิญเข้าร้าน"
      subtitle={invitation?.restaurant?.name || invitation?.email || token}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <StateMessage title="ตรวจคำเชิญไม่ได้" detail={error} /> : null}
      {invitation ? (
        <View style={layout.panel}>
          <Text selectable style={typeScale.cardTitle}>{invitation.restaurant?.name || `ร้าน #${invitation.restaurant_id}`}</Text>
          <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
            ตำแหน่ง: {invitation.role?.name || `role #${invitation.role_id}`}
          </Text>
          <Text selectable style={[typeScale.caption, { color: usable ? colors.accent : colors.danger }]}>
            สถานะ: {usable ? 'รับคำเชิญได้' : invitation.status}
          </Text>
          {!user ? (
            <Text selectable style={[typeScale.caption, { color: colors.muted }]}>
              ต้องเข้าสู่ระบบก่อนรับคำเชิญ ถ้ายังไม่มีบัญชีให้สร้างบัญชีด้วยอีเมลเดียวกับคำเชิญ
            </Text>
          ) : null}
          <Pressable disabled={!usable || accepting} onPress={accept} style={[layout.primaryButton, (!usable || accepting) && { opacity: 0.6 }]}>
            <Text style={layout.primaryButtonText}>{accepting ? 'กำลังรับคำเชิญ' : user ? 'รับคำเชิญ' : 'เข้าสู่ระบบเพื่อรับคำเชิญ'}</Text>
          </Pressable>
          {!user ? (
            <Pressable onPress={() => router.push('/register' as never)} style={layout.secondaryButton}>
              <Text style={layout.secondaryButtonText}>สร้างบัญชีใหม่</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </MobileScreen>
  );
}
