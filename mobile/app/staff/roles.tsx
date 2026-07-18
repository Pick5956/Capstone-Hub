import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { AppScreen } from '@/src/components/app-shell';
import { Button, Divider, EmptyState, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import { parsePermissions } from '@/src/lib/permissions';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Role } from '@/src/types/restaurant';

export default function RolesScreen() {
  const [roles, setRoles] = useState<Role[]>([]); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setError(null); try { const response = await getRoles(); setRoles(response.data || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดบทบาทไม่สำเร็จ'); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return <AppScreen title="บทบาทและสิทธิ์" subtitle="ตั้งค่าสิทธิ์เริ่มต้นสำหรับพนักงานแต่ละบทบาท" topLevel={false} action={<Button compact label="เพิ่มบทบาท" onPress={() => router.push('/staff/role' as never)} />}>{error ? <Feedback title="โหลดบทบาทไม่ได้" detail={error} tone="danger" /> : null}<Surface><SectionHeader title="บทบาททั้งหมด" />{roles.map((role, index) => <View key={role.ID}>{index ? <Divider /> : null}<Pressable onPress={() => router.push({ pathname: '/staff/role' as never, params: { id: String(role.ID) } } as never)} style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.72 : 1 })}><View style={{ flex: 1, gap: 2 }}><Text selectable style={typeScale.cardTitle}>{role.display_name || role.name}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{role.permissions === '["*"]' ? 'ทุกสิทธิ์' : `${parsePermissions(role.permissions).length} สิทธิ์`}{role.is_system ? ' · บทบาทระบบ' : ' · บทบาทร้าน'}</Text></View><Text style={{ color: palette.muted, fontSize: 20 }}>›</Text></Pressable></View>)}{!roles.length ? <EmptyState title="ยังไม่มีบทบาท" /> : null}</Surface></AppScreen>;
}
