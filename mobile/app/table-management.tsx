import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { listTableTags, listTables, listTableZones } from '@/src/api/table';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { tableStatusLabel } from '@/src/lib/format';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { RestaurantTable, TableTag, TableZone } from '@/src/types/table';

export default function TableManagementScreen() {
  const [tables, setTables] = useState<RestaurantTable[]>([]); const [zones, setZones] = useState<TableZone[]>([]); const [tags, setTags] = useState<TableTag[]>([]);
  const [search, setSearch] = useState(''); const [zoneFilter, setZoneFilter] = useState('all'); const [tagFilter, setTagFilter] = useState('all');
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const [tableResponse, zoneResponse, tagResponse] = await Promise.all([listTables(), listTableZones(), listTableTags()]); setTables(tableResponse.tables || []); setZones(zoneResponse.zones || []); setTags(tagResponse.tags || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดผังโต๊ะไม่สำเร็จ'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const filtered = useMemo(() => { const keyword = search.trim().toLowerCase(); return tables.filter((table) => (zoneFilter === 'all' || String(table.zone_id || 'none') === zoneFilter) && (tagFilter === 'all' || table.tags?.some((tag) => String(tag.ID) === tagFilter)) && (!keyword || [table.table_number, table.display_label, table.table_zone?.name, ...(table.tags || []).map((tag) => tag.name)].some((value) => String(value || '').toLowerCase().includes(keyword)))); }, [search, tables, tagFilter, zoneFilter]);
  const counts = { free: tables.filter((table) => table.status === 'free').length, occupied: tables.filter((table) => table.status === 'occupied').length, reserved: tables.filter((table) => table.status === 'reserved').length };
  return (
    <AppScreen title="จัดการโต๊ะ" subtitle={`${tables.length} โต๊ะ · ${zones.length} โซน · ${tags.length} tags`} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={<Button compact label="เพิ่มโต๊ะ" onPress={() => router.push('/table-management/table' as never)} />}>
      {error ? <Feedback title="โหลดผังโต๊ะไม่ได้" detail={error} tone="danger" /> : null}
      <Surface style={{ gap: 0, padding: 0, overflow: 'hidden' }}><View style={{ flexDirection: 'row' }}>{[{ label: 'ว่าง', value: counts.free }, { label: 'ใช้งาน', value: counts.occupied }, { label: 'จอง', value: counts.reserved }].map((item, index) => <View key={item.label} style={{ flex: 1, gap: 2, borderLeftWidth: index ? 1 : 0, borderColor: palette.border, padding: spacing.lg }}><Text selectable style={typeScale.number}>{item.value}</Text><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.label}</Text></View>)}</View></Surface>
      <Surface>
        <SectionHeader title="ผังโต๊ะ" detail="แก้ไขโต๊ะ โซน tag และ QR เมนูลูกค้าผ่านหน้าเต็ม" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}><Button compact variant="secondary" label="จัดการโซน" onPress={() => router.push('/table-management/zones' as never)} style={{ flexGrow: 1 }} /><Button compact variant="secondary" label="จัดการ tags" onPress={() => router.push('/table-management/tags' as never)} style={{ flexGrow: 1 }} /></View>
        <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาโต๊ะ โซน หรือ tag" placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={zoneFilter} onChange={setZoneFilter} options={[{ label: 'ทุกโซน', value: 'all' }, { label: 'ไม่มีโซน', value: 'none' }, ...zones.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
        {tags.length ? <ChipGroup value={tagFilter} onChange={setTagFilter} options={[{ label: 'ทุก tag', value: 'all' }, ...tags.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} /> : null}
      </Surface>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {filtered.map((table) => {
          const tone = table.status === 'free' ? 'success' : table.status === 'occupied' ? 'warning' : table.status === 'reserved' ? 'info' : 'neutral';
          return <Pressable key={table.ID} onPress={() => router.push({ pathname: '/table-management/table' as never, params: { tableId: String(table.ID) } } as never)} style={({ pressed }) => ({ minWidth: 150, minHeight: 132, flexGrow: 1, flexBasis: 170, gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, padding: spacing.lg, opacity: pressed ? 0.76 : 1 })}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}><Text selectable style={[typeScale.title, { flex: 1 }]}>{table.display_label || table.table_number}</Text><StatusBadge label={tableStatusLabel(table.status)} tone={tone} /></View><Text selectable style={[typeScale.caption, { color: palette.muted }]}>{table.table_zone?.name || table.zone || 'ไม่มีโซน'} · {table.capacity} ที่นั่ง</Text>{table.tags?.length ? <Text selectable numberOfLines={2} style={[typeScale.caption, { color: palette.muted }]}>{table.tags.map((tag) => tag.name).join(', ')}</Text> : null}<View style={{ flex: 1 }} /><Text selectable style={[typeScale.caption, { color: table.customer_token ? palette.success : palette.muted }]}>{table.customer_token ? 'QR เมนูพร้อมใช้' : 'ยังไม่มี QR เมนู'}</Text></Pressable>;
        })}
      </View>
      {!loading && !filtered.length ? <EmptyState title="ไม่พบโต๊ะ" detail={tables.length ? 'ลองเปลี่ยนตัวกรองหรือคำค้น' : 'เพิ่มโต๊ะแบบเดี่ยวหรือสร้างหลายโต๊ะในหน้าเพิ่มโต๊ะ'} /> : null}
    </AppScreen>
  );
}
