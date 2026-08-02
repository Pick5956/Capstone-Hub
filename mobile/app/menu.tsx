import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, View } from 'react-native';

import { apiUrl } from '@/src/api/client';
import { listCategories, listMenuItems, setMenuItemAvailability } from '@/src/api/menu';
import { AppText as Text } from '@/src/components/app-text';
import { AppTextInput as TextInput } from '@/src/components/app-text-input';
import { AppScreen } from '@/src/components/app-shell';
import { Button, ChipGroup, EmptyState, Feedback, SectionHeader, StatusBadge, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { inputStyles, palette, radius, spacing, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';

function resolveImage(value: string) { if (!value) return ''; if (value.startsWith('http')) return value; return `${apiUrl}${value.startsWith('/') ? '' : '/'}${value}`; }

export default function MenuScreen() {
  const { activeMembership } = useAuth();
  const { copy, language } = useDisplayPreferences();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState('all');
  const [availability, setAvailability] = useState<'all' | 'available' | 'hidden'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = can(activeMembership, 'manage_menu');
  const canView = canManage || can(activeMembership, 'view_menu');
  const load = useCallback(async () => { if (!canView) { setLoading(false); return; } setLoading(true); setError(null); try { const [categoryResponse, itemResponse] = await Promise.all([listCategories(), listMenuItems()]); setCategories(categoryResponse.categories || []); setItems(itemResponse.menu_items || []); } catch (err) { setError(err instanceof Error ? err.message : copy('โหลดเมนูไม่สำเร็จ', 'Could not load the menu')); } finally { setLoading(false); } }, [canView, copy]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = category === 'all' || item.category_id === Number(category) || item.categories?.some((link) => link.category_id === Number(category));
      const availabilityMatch = availability === 'all' || (availability === 'available' ? item.is_available : !item.is_available);
      return categoryMatch && availabilityMatch && (!keyword || [item.name, item.description].some((value) => String(value || '').toLowerCase().includes(keyword)));
    });
  }, [availability, category, items, search]);
  async function toggle(item: MenuItem) { if (!canManage) return; setSavingId(item.ID); setError(null); try { const updated = await setMenuItemAvailability(item.ID, !item.is_available); setItems((current) => current.map((entry) => (entry.ID === updated.ID ? updated : entry))); } catch (err) { setError(err instanceof Error ? err.message : copy('เปลี่ยนสถานะเมนูไม่สำเร็จ', 'Could not change the menu status')); } finally { setSavingId(null); } }
  if (!canView) {
    return <AppScreen title={copy('เมนูอาหาร', 'Menu')} topLevel><EmptyState title={copy('ไม่มีสิทธิ์ดูเมนู', 'Menu access unavailable')} detail={copy('บัญชีนี้ยังไม่ได้รับสิทธิ์ดูหรือจัดการเมนู', 'This account does not have permission to view or manage the menu.')} /></AppScreen>;
  }
  return (
    <AppScreen title={copy('เมนูอาหาร', 'Menu')} subtitle={copy(`${items.length.toLocaleString('th-TH')} เมนู · ${categories.length.toLocaleString('th-TH')} หมวด${canManage ? '' : ' · ดูอย่างเดียว'}`, `${items.length.toLocaleString('en-US')} items · ${categories.length.toLocaleString('en-US')} categories${canManage ? '' : ' · Read only'}`)} topLevel refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} action={canManage ? <Button compact label={copy('เพิ่มเมนู', 'Add item')} onPress={() => router.push('/menu/item' as never)} /> : undefined}>
      {error ? <Feedback title={copy('ทำรายการไม่ได้', 'Unable to complete the action')} detail={error} tone="danger" /> : null}
      <Surface>
        <SectionHeader title={copy('ค้นหาและกรอง', 'Search and filters')} action={canManage ? <Button compact variant="secondary" label={copy('จัดการหมวด', 'Manage categories')} onPress={() => router.push('/menu/categories' as never)} /> : undefined} />
        <TextInput accessibilityLabel={copy('ค้นหาชื่อเมนู', 'Search menu items')} value={search} onChangeText={setSearch} placeholder={copy('ค้นหาชื่อเมนู', 'Search menu items')} placeholderTextColor={palette.placeholder} style={inputStyles.input} />
        <ChipGroup value={category} onChange={setCategory} options={[{ label: copy('ทุกหมวด', 'All categories'), value: 'all' }, ...categories.filter((item) => item.is_active).map((item) => ({ label: item.name, value: String(item.ID) }))]} />
        <ChipGroup value={availability} onChange={setAvailability} options={[{ label: copy('ทั้งหมด', 'All'), value: 'all' }, { label: copy('พร้อมขาย', 'Available'), value: 'available' }, { label: copy('ปิดขาย', 'Unavailable'), value: 'hidden' }]} />
      </Surface>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {filtered.map((item) => (
          <Pressable accessibilityLabel={copy(`เมนู ${item.name}`, `Menu item ${item.name}`)} key={item.ID} disabled={!canManage} onPress={() => router.push({ pathname: '/menu/item' as never, params: { id: String(item.ID) } } as never)} style={({ pressed }) => ({ minWidth: 160, flexGrow: 1, flexBasis: 190, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, backgroundColor: palette.surface, overflow: 'hidden', opacity: pressed ? 0.76 : 1 })}>
            {item.image_url ? <Image accessibilityLabel={copy(`รูปเมนู ${item.name}`, `Photo of ${item.name}`)} source={{ uri: resolveImage(item.image_url) }} resizeMode="contain" style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: palette.surfaceSubtle }} /> : <View style={{ width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceSubtle }}><Text style={{ color: palette.muted, fontSize: 12 }}>{copy('ยังไม่มีรูปเมนู', 'No menu photo')}</Text></View>}
            <View style={{ gap: spacing.sm, padding: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}><Text selectable numberOfLines={2} style={[typeScale.cardTitle, { flex: 1 }]}>{item.name}</Text><StatusBadge label={item.is_available ? copy('พร้อมขาย', 'Available') : copy('ปิดขาย', 'Unavailable')} tone={item.is_available ? 'success' : 'neutral'} /></View>
              <Text selectable style={typeScale.number}>{money(item.price, language)}</Text>
              {canManage ? <Button compact variant="secondary" label={savingId === item.ID ? copy('กำลังบันทึก...', 'Saving...') : item.is_available ? copy('ปิดขายชั่วคราว', 'Mark unavailable') : copy('เปิดขาย', 'Make available')} onPress={() => toggle(item)} loading={savingId === item.ID} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
      {!loading && !filtered.length ? <EmptyState title={copy('ไม่พบเมนู', 'No menu items found')} detail={items.length ? copy('ลองเปลี่ยนตัวกรองหรือคำค้น', 'Try changing the filters or search term.') : canManage ? copy('เพิ่มเมนูแรกเพื่อเริ่มรับออเดอร์', 'Add your first item to start taking orders.') : copy('เจ้าของร้านยังไม่ได้เปิดเมนูให้ดู', 'The restaurant has not made any menu items visible yet.')} /> : null}
    </AppScreen>
  );
}
