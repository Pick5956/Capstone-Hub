import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { listMenuItems } from '@/src/api/menu';
import { getOrder } from '@/src/api/order';
import { AppText as Text } from '@/src/components/app-text';
import { AppRefreshControl, AppScreen } from '@/src/components/app-shell';
import { MenuImage } from '@/src/components/menu-image';
import { Divider, EmptyState, Feedback, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import { createOrderDetailRequestGuard, orderSummaryPresentation, selectOrderItemImage } from '@/src/lib/order-detail-runtime';
import { activeOrderItems } from '@/src/lib/order-workflow';
import { createRequestGeneration } from '@/src/lib/request-generation';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

export default function OrderSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;
  const { activeMembership } = useAuth();
  const { language } = useDisplayPreferences();
  const canAccessOrder = can(activeMembership, 'view_orders')
    || can(activeMembership, 'take_order')
    || can(activeMembership, 'take_payment');
  const [order, setOrder] = useState<Order | null>(null);
  const [menuImageById, setMenuImageById] = useState<ReadonlyMap<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createOrderDetailRequestGuard(createRequestGeneration()));
  const presentation = useMemo(() => orderSummaryPresentation(language), [language]);
  const items = useMemo(() => activeOrderItems(order?.items), [order?.items]);
  const quantity = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  useEffect(() => {
    if (!canAccessOrder) return;
    let active = true;
    void listMenuItems()
      .then((response) => {
        if (!active) return;
        setMenuImageById(new Map(
          (response.menu_items || []).map((item) => [item.ID, item.image_url]),
        ));
      })
      .catch(() => {
        if (active) setMenuImageById(new Map());
      });
    return () => { active = false; };
  }, [canAccessOrder]);

  const load = useCallback(async (quiet = false) => {
    if (!canAccessOrder || !validOrderId) {
      setLoading(false);
      return;
    }

    const request = requestGuardRef.current.beginLoad();
    if (request === null) return;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const nextOrder = await getOrder(orderId);
      if (requestGuardRef.current.canApplyLoad(request)) setOrder(nextOrder);
    } catch (err) {
      if (!quiet && requestGuardRef.current.canApplyLoad(request)) {
        setError(err instanceof Error ? err.message : language === 'th' ? 'โหลดสรุปคำสั่งซื้อไม่สำเร็จ' : 'Could not load the order summary');
      }
    } finally {
      if (!quiet && requestGuardRef.current.canApplyLoad(request)) setLoading(false);
    }
  }, [canAccessOrder, language, orderId, validOrderId]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(true), 10000);
    return () => {
      clearInterval(timer);
      requestGuardRef.current.invalidateLoads();
    };
  }, [load]));

  if (!canAccessOrder) {
    return (
      <AppScreen title={presentation.title} topLevel={false}>
        <EmptyState title={language === 'th' ? 'ไม่มีสิทธิ์ดูออเดอร์' : 'No permission to view this order'} />
      </AppScreen>
    );
  }

  if (!validOrderId) {
    return (
      <AppScreen title={presentation.title} topLevel={false}>
        <EmptyState title={language === 'th' ? 'ไม่พบออเดอร์นี้' : 'Order not found'} />
      </AppScreen>
    );
  }

  const footer = order ? (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Text style={[typeScale.caption, { color: palette.muted, fontWeight: '700' }]}>{presentation.totalLabel}</Text>
      <Text style={[typeScale.number, { fontSize: 20 }]}>{money(order.total_amount, language)}</Text>
    </View>
  ) : undefined;

  return (
    <AppScreen
      title={presentation.title}
      subtitle={order ? `${order.table?.display_label || order.order_number} · ${quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')} ${language === 'th' ? 'รายการ' : 'Items'}` : undefined}
      topLevel={false}
      footer={footer}
      refreshControl={<AppRefreshControl onRefresh={() => load()} />}
    >
      {error ? <Feedback title={language === 'th' ? 'โหลดสรุปไม่ได้' : 'Could not load the summary'} detail={error} tone="danger" /> : null}
      {loading ? (
        <EmptyState title={language === 'th' ? 'กำลังโหลดสรุปคำสั่งซื้อ' : 'Loading order summary'} />
      ) : items.length ? (
        <Surface style={{ gap: 0, overflow: 'hidden', padding: 0 }}>
          {items.map((item, index) => {
            const imageUrl = selectOrderItemImage({
              menuId: item.menu_id,
              menuImageUrl: item.menu?.image_url,
            }, menuImageById);
            return (
              <View key={item.ID}>
                {index ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md }}>
                  <MenuImage
                    accessibilityLabel={language === 'th' ? `รูปเมนู ${item.menu_name}` : `Photo of ${item.menu_name}`}
                    imageUrl={imageUrl}
                    variant="row"
                  />
                  <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
                    <Text selectable style={typeScale.cardTitle}>{item.menu_name}</Text>
                    {item.selected_options?.length ? (
                      <Text selectable style={[typeScale.caption, { color: palette.muted }]}>
                        {item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(' · ')}
                      </Text>
                    ) : null}
                    {item.note ? <Text selectable style={[typeScale.caption, { color: palette.muted }]}>{item.note}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text selectable style={[typeScale.cardTitle, { fontVariant: ['tabular-nums'] }]}>{money(item.subtotal, language)}</Text>
                    <Text selectable style={[typeScale.caption, { color: palette.muted, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>x{item.quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </Surface>
      ) : (
        <EmptyState title={presentation.empty} />
      )}
    </AppScreen>
  );
}
