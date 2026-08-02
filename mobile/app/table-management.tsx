import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { listTableTags, listTables, listTableZones } from '@/src/api/table';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { tableStatusLabel } from '@/src/lib/format';
import { tableManagementAccess } from '@/src/lib/permission-parity';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { RestaurantTable, TableTag, TableZone } from '@/src/types/table';

export default function TableManagementScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const access = tableManagementAccess(
    can(activeMembership, 'view_tables'),
    can(activeMembership, 'manage_table'),
  );
  const canView = access.canView;
  const canManage = access.canMutate;
  const [tables, setTables] = useState<RestaurantTable[]>([]); const [zones, setZones] = useState<TableZone[]>([]); const [tags, setTags] = useState<TableTag[]>([]);
  const [search, setSearch] = useState(''); const [zoneFilter, setZoneFilter] = useState('all'); const [tagFilter, setTagFilter] = useState('all');
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!canView) { setLoading(false); return; } setLoading(true); setError(null); try { const [tableResponse, zoneResponse, tagResponse] = await Promise.all([listTables(), listTableZones(), listTableTags()]); setTables(tableResponse.tables || []); setZones(zoneResponse.zones || []); setTags(tagResponse.tags || []); } catch (err) { setError(err instanceof Error ? err.message : copy('โหลดผังโต๊ะไม่สำเร็จ', 'Unable to load table layout')); } finally { setLoading(false); } }, [canView, copy]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const filtered = useMemo(() => { const keyword = search.trim().toLowerCase(); return tables.filter((table) => (zoneFilter === 'all' || String(table.zone_id || 'none') === zoneFilter) && (tagFilter === 'all' || table.tags?.some((tag) => String(tag.ID) === tagFilter)) && (!keyword || [table.table_number, table.display_label, table.table_zone?.name, ...(table.tags || []).map((tag) => tag.name)].some((value) => String(value || '').toLowerCase().includes(keyword)))); }, [search, tables, tagFilter, zoneFilter]);
  const counts = { occupied: tables.filter((table) => table.status === 'occupied').length, inactive: tables.filter((table) => table.status === 'inactive').length };
  if (!canView) {
    return <AppScreen title={copy('จัดการโต๊ะ', 'Table management')} topLevel><EmptyState title={copy('ไม่มีสิทธิ์ดูผังโต๊ะ', 'No table layout access')} detail={copy('ต้องมีสิทธิ์ view_tables หรือ manage_table', 'You need the view_tables or manage_table permission.')} /></AppScreen>;
  }
  return (
    <AppScreen title={copy('จัดการโต๊ะ', 'Table management')} subtitle={copy(`${tables.length.toLocaleString('th-TH')} โต๊ะ · ${zones.length.toLocaleString('th-TH')} โซน · ${tags.length.toLocaleString('th-TH')} แท็ก`, `${tables.length.toLocaleString('en-US')} tables · ${zones.length.toLocaleString('en-US')} zones · ${tags.length.toLocaleString('en-US')} tags`)} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={canManage ? <Button compact label={copy('เพิ่มโต๊ะ', 'Add table')} onPress={() => router.push('/table-management/table' as never)} /> : undefined}>
      {error ? <Feedback title={copy('โหลดผังโต๊ะไม่ได้', 'Unable to load table layout')} detail={error} tone="danger" /> : null}
      <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}><View style={{ flexDirection: 'row' }}>{[{ label: copy('ทั้งหมด', 'Total'), value: tables.length }, { label: copy('กำลังใช้งาน', 'Occupied'), value: counts.occupied }, { label: copy('ปิดใช้งาน', 'Inactive'), value: counts.inactive }, { label: copy('โซน', 'Zones'), value: zones.length }].map((item, index) => <View key={item.label} style={{ flex: 1, gap: 2, borderLeftWidth: index ? 1 : 0, borderColor: palette.border, padding: spacing.lg }}><Text selectable style={typeScale.number}>{item.value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text></View>)}</View></Surface>
      <Surface>
        <SectionHeader title={copy('ผังโต๊ะ', 'Table layout')} detail={canManage ? copy('แก้ไขโต๊ะ โซน แท็ก และ QR เมนูลูกค้าผ่านหน้าเต็ม', 'Edit tables, zones, tags, and customer-menu QR codes in the full editor.') : copy('ดูสถานะ ตำแหน่ง และจำนวนที่นั่งของโต๊ะในร้าน', 'View each table’s status, location, and seating capacity.')} />
        {canManage ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}><Button compact variant="secondary" label={copy('จัดการโซน', 'Manage zones')} onPress={() => router.push('/table-management/zones' as never)} style={{ flexGrow: 1 }} /><Button compact variant="secondary" label={copy('จัดการแท็ก', 'Manage tags')} onPress={() => router.push('/table-management/tags' as never)} style={{ flexGrow: 1 }} /></View> : null}
        <TextInput value={search} onChangeText={setSearch} placeholder={copy('ค้นหาโต๊ะ โซน หรือแท็ก', 'Search tables, zones, or tags')} placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={zoneFilter} onChange={setZoneFilter} options={[{ label: copy('ทุกโซน', 'All zones'), value: 'all' }, { label: copy('ไม่มีโซน', 'No zone'), value: 'none' }, ...zones.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
        {tags.length ? <ChipGroup value={tagFilter} onChange={setTagFilter} options={[{ label: copy('ทุกแท็ก', 'All tags'), value: 'all' }, ...tags.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} /> : null}
      </Surface>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {filtered.map((table) => {
          const tone = table.status === 'free' ? 'success' : table.status === 'occupied' ? 'warning' : table.status === 'reserved' ? 'info' : 'neutral';
          return <Pressable key={table.ID} disabled={!canManage} onPress={() => router.push({ pathname: '/table-management/table' as never, params: { tableId: String(table.ID) } } as never)} style={({ pressed }) => ({ minWidth: 150, minHeight: 132, flexGrow: 1, flexBasis: 170, gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: canManage && pressed ? 0.76 : 1 })}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}><Text selectable style={[typeScale.title, { flex: 1 }]}>{table.display_label || table.table_number}</Text><StatusBadge label={tableStatusLabel(table.status, language)} tone={tone} /></View><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{table.table_zone?.name || table.zone || copy('ไม่มีโซน', 'No zone')} · {copy(`${table.capacity.toLocaleString('th-TH')} ที่นั่ง`, `${table.capacity.toLocaleString('en-US')} seats`)}</Text>{table.tags?.length ? <Text selectable numberOfLines={2} style={[typeScale.caption, { color: palette.muted }]}>{table.tags.map((tag) => tag.name).join(', ')}</Text> : null}<View style={{ flex: 1 }} /><Text selectable style={[typeScale.caption, { color: table.customer_token ? palette.success : palette.muted }]}>{table.customer_token ? copy('QR เมนูพร้อมใช้', 'Menu QR ready') : copy('ยังไม่มี QR เมนู', 'No menu QR yet')}</Text></Pressable>;
        })}
      </View>
      {!loading && !filtered.length ? <EmptyState title={copy('ไม่พบโต๊ะ', 'No tables found')} detail={tables.length ? copy('ลองเปลี่ยนตัวกรองหรือคำค้น', 'Try changing the filters or search term.') : canManage ? copy('เพิ่มโต๊ะแบบเดี่ยวหรือสร้างหลายโต๊ะในหน้าเพิ่มโต๊ะ', 'Add one table or create multiple tables from the add-table screen.') : copy('ร้านนี้ยังไม่มีข้อมูลโต๊ะ', 'This restaurant has no table data yet.')} /> : null}
    </AppScreen>
  );
}
