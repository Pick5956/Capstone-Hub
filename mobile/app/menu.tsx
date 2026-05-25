import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { listCategories, listMenuItems } from '@/src/api/menu';
import { MobileScreen, StateMessage } from '@/src/components/mobile-screen';
import { money } from '@/src/lib/format';
import { colors, layout, typeScale } from '@/src/theme';
import type { Category, MenuItem } from '@/src/types/menu';

export default function MenuScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeName = useMemo(() => {
    if (!activeCategoryId) return 'ทั้งหมด';
    return categories.find((category) => category.ID === activeCategoryId)?.name || 'หมวด';
  }, [activeCategoryId, categories]);

  const load = useCallback(async (categoryId = activeCategoryId) => {
    setError(null);
    try {
      const [categoryResponse, itemResponse] = await Promise.all([
        listCategories(),
        listMenuItems(categoryId),
      ]);
      setCategories(categoryResponse.categories);
      setItems(itemResponse.menu_items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดเมนูไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [activeCategoryId]);

  useEffect(() => {
    load(activeCategoryId);
  }, [activeCategoryId, load]);

  return (
    <MobileScreen
      kicker="MENU"
      title="เมนูอาหาร"
      subtitle={`${activeName} · ${items.length} รายการ`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(activeCategoryId)} />}
    >
      <View style={layout.panel}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            onPress={() => setActiveCategoryId(undefined)}
            style={[layout.secondaryButton, !activeCategoryId && { backgroundColor: colors.primary }]}
          >
            <Text style={[layout.secondaryButtonText, !activeCategoryId && { color: '#FFFFFF' }]}>ทั้งหมด</Text>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.ID}
              onPress={() => setActiveCategoryId(category.ID)}
              style={[layout.secondaryButton, activeCategoryId === category.ID && { backgroundColor: colors.primary }]}
            >
              <Text style={[layout.secondaryButtonText, activeCategoryId === category.ID && { color: '#FFFFFF' }]}>
                {category.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? <StateMessage title="โหลดเมนูไม่ได้" detail={error} /> : null}
      {!error && !loading && items.length === 0 ? <StateMessage title="ยังไม่มีเมนูในหมวดนี้" /> : null}
      <View style={{ gap: 10 }}>
        {items.map((item) => (
          <View key={item.ID} style={layout.card}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text selectable style={typeScale.cardTitle}>{item.name}</Text>
              {item.description ? (
                <Text selectable numberOfLines={2} style={[typeScale.caption, { color: colors.muted }]}>
                  {item.description}
                </Text>
              ) : null}
              <Text selectable style={[typeScale.caption, { color: item.is_available ? colors.muted : colors.danger }]}>
                {item.is_available ? 'พร้อมขาย' : 'ปิดขาย'}
              </Text>
            </View>
            <Text selectable style={[typeScale.cardTitle, { color: colors.text }]}>{money(item.price)}</Text>
          </View>
        ))}
      </View>
    </MobileScreen>
  );
}
