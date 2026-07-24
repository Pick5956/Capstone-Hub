import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getRoles } from '@/src/api/auth';
import { listMembers, updateMemberPermissions, updateMemberRole, updateMemberStatus } from '@/src/api/restaurant';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, Feedback, SectionHeader, Surface } from '@/src/components/ui';
import { parsePermissions, permissionGroups } from '@/src/lib/permissions';
import { useAuth } from '@/src/providers/auth-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Membership, Role } from '@/src/types/restaurant';

export default function StaffMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const memberId = Number(id);
  const { activeMembership } = useAuth(); const restaurantId = activeMembership?.restaurant_id;
  const [member, setMember] = useState<Membership | null>(null); const [roles, setRoles] = useState<Role[]>([]); const [roleId, setRoleId] = useState(0); const [status, setStatus] = useState<Membership['status']>('active');
  const [useRolePermissions, setUseRolePermissions] = useState(true); const [permissions, setPermissions] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (!restaurantId) return; Promise.all([listMembers(restaurantId), getRoles()]).then(([memberResponse, roleResponse]) => { const next = memberResponse.members.find((item) => item.ID === memberId) || null; setMember(next); setRoles((roleResponse.data || []).filter((role) => role.name !== 'owner' || next?.role?.name === 'owner')); setRoleId(next?.role_id || 0); setStatus(next?.status || 'active'); setUseRolePermissions(next?.permissions_override == null); setPermissions(parsePermissions(next?.permissions_override ?? next?.role?.permissions)); }).catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลพนักงานไม่สำเร็จ')); }, [memberId, restaurantId]);
  const roleOptions = useMemo(() => roles.map((role) => ({ label: role.display_name || role.name, value: role.ID })), [roles]);
  function toggle(key: string) { setPermissions((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  async function save() { if (!restaurantId || !member) return; setSaving(true); setError(null); setMessage(null); try { if (roleId !== member.role_id) await updateMemberRole(restaurantId, member.ID, roleId); if (status !== member.status) await updateMemberStatus(restaurantId, member.ID, status); await updateMemberPermissions(restaurantId, member.ID, useRolePermissions ? null : permissions); setMessage('บันทึกข้อมูลพนักงานแล้ว'); } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกพนักงานไม่สำเร็จ'); } finally { setSaving(false); } }
  return (
    <AppScreen title={member?.user?.nickname || member?.user?.first_name || 'ข้อมูลพนักงาน'} subtitle={member?.user?.email || 'กำลังโหลดข้อมูล'} topLevel={false}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}{message ? <Feedback title={message} tone="success" /> : null}
      {member ? <><Surface><SectionHeader title="บทบาทและสถานะ" /><ChipGroup label="บทบาท" value={roleId} onChange={setRoleId} options={roleOptions} /><ChipGroup label="สถานะ" value={status} onChange={setStatus} options={[{ label: 'เปิดใช้งาน', value: 'active' }, { label: 'พักสิทธิ์', value: 'suspended' }, { label: 'นำออกจากร้าน', value: 'removed' }]} /></Surface>
      <Surface><SectionHeader title="สิทธิ์การใช้งาน" detail={useRolePermissions ? 'ใช้สิทธิ์เริ่มต้นจากบทบาทที่เลือก' : `กำหนดเอง ${permissions.length} สิทธิ์`} /><ChipGroup value={useRolePermissions ? 'role' : 'custom'} onChange={(value) => { setUseRolePermissions(value === 'role'); if (value === 'role') setPermissions(parsePermissions(roles.find((role) => role.ID === roleId)?.permissions)); }} options={[{ label: 'ตามบทบาท', value: 'role' }, { label: 'กำหนดเอง', value: 'custom' }]} />{!useRolePermissions ? permissionGroups.map((group) => <View key={group.title} style={{ gap: spacing.sm }}><Text style={typeScale.cardTitle}>{group.title}</Text>{group.rows.map((row) => { const active = permissions.includes(row.key); return <Pressable key={row.key} onPress={() => toggle(row.key)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: active ? palette.primary : palette.borderStrong, borderRadius: radius.md, backgroundColor: active ? palette.primary : palette.surface, paddingHorizontal: spacing.md, opacity: pressed ? 0.76 : 1 })}><Text style={{ flex: 1, color: active ? palette.primaryText : palette.text, fontSize: 14, fontWeight: '600' }}>{row.label}</Text><Text style={{ color: active ? palette.primaryText : palette.muted }}>{active ? '✓' : ''}</Text></Pressable>; })}</View>) : null}</Surface>
      <Surface><Button label="บันทึกข้อมูลพนักงาน" onPress={save} loading={saving} /><Button variant="secondary" label="กลับหน้าทีมงาน" onPress={() => router.back()} /></Surface></> : null}
    </AppScreen>
  );
}
