import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { apiUrl } from '@/src/api/client';
import { listCategories, listMenuItems, setMenuItemAvailability } from '@/src/api/menu';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';

function resolveImage(value: string) { if (!value) return ''; if (value.startsWith('http')) return value; return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`; }

export default function MenuScreen() {
  const { activeMembership } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState<'all' | 'available' | 'hidden'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = can(activeMembership, 'manage_menu');
  const load = useCallback(async () => { setLoading(true); setError(null); try { const [categoryResponse, itemResponse] = await Promise.all([listCategories(), listMenuItems()]); setCategories(categoryResponse.categories || []); setItems(itemResponse.menu_items || []); } catch (err) { setError(err instanceof Error ? err.message : 'โหลดเมนูไม่สำเร็จ'); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = category === 'all' || item.category_id === Number(category) || item.categories?.some((link) => link.category_id === Number(category));
      const availabilityMatch = availability === 'all' || (availability === 'available' ? item.is_available : !item.is_available);
      return categoryMatch && availabilityMatch && (!keyword || [item.name, item.description].some((value) => String(value || '').toLowerCase().includes(keyword)));
    });
  }, [availability, category, items, search]);
  async function toggle(item: MenuItem) { setSavingId(item.ID); setError(null); try { await setMenuItemAvailability(item.ID, !item.is_available); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'เปลี่ยนสถานะเมนูไม่สำเร็จ'); } finally { setSavingId(null); } }
  return (
    <AppScreen title="เมนูอาหาร" subtitle={`${items.length} เมนู · ${categories.length} หมวด`} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={canManage ? <Button compact label="เพิ่มเมนู" onPress={() => router.push('/menu/item' as never)} /> : undefined}>
      {error ? <Feedback title="ทำรายการไม่ได้" detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title="ค้นหาและกรอง" action={canManage ? <Button compact variant="secondary" label="จัดการหมวด" onPress={() => router.push('/menu/categories' as never)} /> : undefined} />
        <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาชื่อเมนู" placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={category} onChange={setCategory} options={[{ label: 'ทุกหมวด', value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
        <ChipGroup value={availability} onChange={setAvailability} options={[{ label: 'ทั้งหมด', value: 'all' }, { label: 'พร้อมขาย', value: 'available' }, { label: 'ปิดขาย', value: 'hidden' }]} />
      </Surface>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {filtered.map((item) => (
          <Pressable key={item.ID} disabled={!canManage} onPress={() => router.push({ pathname: '/menu/item' as never, params: { id: String(item.ID) } } as never)} style={({ pressed }) => ({ minWidth: 160, flexGrow: 1, flexBasis: 190, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, overflow: 'hidden', opacity: pressed ? 0.76 : 1 })}>
            {item.image_url ? <Image source={{ uri: resolveImage(item.image_url) }} resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: palette.surfaceStrong }} /> : <View style={{ width: '100%', aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceSubtle }}><Text style={{ color: palette.muted, fontSize: 12 }}>ไม่มีรูปเมนู</Text></View>}
            <View style={{ gap: spacing.sm, padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}><Text selectable numberOfLines={2} style={[typeScale.cardTitle, { flex: 1 }]}>{item.name}</Text><StatusBadge label={item.is_available ? 'พร้อมขาย' : 'ปิดขาย'} tone={item.is_available ? 'success' : 'neutral'} /></View>
              <Text selectable style={typeScale.number}>{money(item.price)}</Text>
              {canManage ? <Button compact variant="secondary" label={savingId === item.ID ? 'กำลังบันทึก...' : item.is_available ? 'ปิดขายชั่วคราว' : 'เปิดขาย'} onPress={() => toggle(item)} loading={savingId === item.ID} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
      {!loading && !filtered.length ? <EmptyState title="ไม่พบเมนู" detail={items.length ? 'ลองเปลี่ยนตัวกรองหรือคำค้น' : 'เพิ่มเมนูแรกเพื่อเริ่มรับออเดอร์'} /> : null}
    </AppScreen>
  );
}
