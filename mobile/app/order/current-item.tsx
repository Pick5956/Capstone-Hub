import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { listMenuItems } from '@/src/api/menu';
import { getOrder, updateOrderItem } from '@/src/api/order';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { MenuImage } from '@/src/components/menu-image';
import { ActionDock, Button, EmptyState, Feedback, Surface } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import {
  createOrderDetailRequestGuard,
  findPendingOrderItem,
  selectOrderItemImage,
} from '@/src/lib/order-detail-runtime';
import { createRequestGeneration } from '@/src/lib/request-generation';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, radius, spacing, typeScale } from '@/src/theme';
import type { Order } from '@/src/types/order';

function QuantityButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'add' | 'remove';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: palette.borderStrong,
        borderRadius: radius.md,
        backgroundColor: pressed ? palette.surfaceStrong : palette.surface,
        opacity: disabled ? 0.42 : pressed ? 0.74 : 1,
      })}
    >
      <AppIcon color={palette.textStrong} name={icon} size={22} />
    </Pressable>
  );
}

export default function CurrentRoundItemScreen() {
  const params = useLocalSearchParams<{ id: string; itemId: string }>();
  const orderId = Number(params.id);
  const itemId = Number(params.itemId);
  const validParams = Number.isInteger(orderId) && orderId > 0
    && Number.isInteger(itemId) && itemId > 0;
  const { activeMembership } = useAuth();
  const { language } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const [order, setOrder] = useState<Order | null>(null);
  const [menuImageById, setMenuImageById] = useState<ReadonlyMap<number, string>>(new Map());
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createOrderDetailRequestGuard(createRequestGeneration()));
  const item = useMemo(() => findPendingOrderItem(order?.items, itemId), [itemId, order?.items]);
  const locked = order?.status === 'completed' || order?.status === 'cancelled';

  const load = useCallback(async () => {
    if (!canTakeOrder || !validParams) {
      setLoading(false);
      return;
    }

    const request = requestGuardRef.current.beginLoad();
    if (request === null) return;
    setLoading(true);
    setError(null);
    try {
      const [nextOrder, menuResponse] = await Promise.all([
        getOrder(orderId),
        listMenuItems().catch(() => ({ menu_items: [] })),
      ]);
      if (!requestGuardRef.current.canApplyLoad(request)) return;
      const nextItem = findPendingOrderItem(nextOrder.items, itemId);
      setOrder(nextOrder);
      setQuantity(nextItem?.quantity ?? 1);
      setMenuImageById(new Map(
        (menuResponse.menu_items ?? [])
          .filter((menu) => Boolean(menu.image_url?.trim()))
          .map((menu) => [menu.ID, menu.image_url]),
      ));
    } catch (err) {
      if (requestGuardRef.current.canApplyLoad(request)) {
        setError(err instanceof Error ? err.message : language === 'th' ? 'โหลดรายการไม่สำเร็จ' : 'Could not load this item');
      }
    } finally {
      if (requestGuardRef.current.canApplyLoad(request)) setLoading(false);
    }
  }, [canTakeOrder, itemId, language, orderId, validParams]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => requestGuardRef.current.invalidateLoads();
  }, [load]));

  async function saveQuantity() {
    if (!item || locked || quantity === item.quantity || !requestGuardRef.current.beginMutation()) return;

    setSaving(true);
    setError(null);
    try {
      await updateOrderItem(orderId, item.ID, { quantity, note: item.note });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : language === 'th' ? 'บันทึกจำนวนไม่สำเร็จ' : 'Could not save the quantity');
    } finally {
      requestGuardRef.current.finishMutation();
      setSaving(false);
    }
  }

  if (!canTakeOrder) {
    return (
      <AppScreen title={language === 'th' ? 'แก้จำนวน' : 'Edit quantity'} topLevel={false}>
        <EmptyState title={language === 'th' ? 'ไม่มีสิทธิ์รับออเดอร์' : 'No order-taking permission'} />
      </AppScreen>
    );
  }

  if (!validParams) {
    return (
      <AppScreen title={language === 'th' ? 'แก้จำนวน' : 'Edit quantity'} topLevel={false}>
        <EmptyState title={language === 'th' ? 'ไม่พบรายการนี้' : 'Item not found'} />
      </AppScreen>
    );
  }

  const imagePath = item ? selectOrderItemImage({
    menuId: item.menu_id,
    menuImageUrl: item.menu?.image_url,
  }, menuImageById) : null;
  const unitSubtotal = item && item.quantity > 0 ? item.subtotal / item.quantity : 0;
  const total = unitSubtotal * quantity;
  const quantityChanged = Boolean(item && quantity !== item.quantity);
  const contextLabel = order
    ? order.table?.display_label || (order.order_type === 'takeaway'
      ? language === 'th' ? 'ซื้อกลับบ้าน' : 'Takeaway'
      : order.order_number)
    : language === 'th' ? 'รายการรอบนี้' : 'Current round';
  const footer = item ? (
    <ActionDock
      label={language === 'th' ? `${quantity.toLocaleString('th-TH')} รายการ` : `${quantity.toLocaleString('en-US')} Items`}
      value={money(total, language)}
    >
      <Button
        label={language === 'th' ? 'บันทึกจำนวน' : 'Save quantity'}
        onPress={saveQuantity}
        loading={saving}
        disabled={Boolean(locked) || !quantityChanged}
      />
    </ActionDock>
  ) : undefined;

  return (
    <AppScreen
      title={item?.menu_name || (language === 'th' ? 'แก้จำนวน' : 'Edit quantity')}
      subtitle={contextLabel}
      topLevel={false}
      footer={footer}
    >
      {error ? <Feedback title={language === 'th' ? 'บันทึกจำนวนไม่ได้' : 'Could not save the quantity'} detail={error} tone="danger" /> : null}
      {loading ? (
        <EmptyState title={language === 'th' ? 'กำลังโหลดรายการ' : 'Loading item'} />
      ) : item ? (
        <>
          <MenuImage
            accessibilityLabel={language === 'th' ? `รูปเมนู ${item.menu_name}` : `Photo of ${item.menu_name}`}
            imageUrl={imagePath}
            variant="hero"
          />
          <Surface>
            {item.selected_options?.length ? (
              <Text selectable style={[typeScale.body, { color: palette.muted }]}>
                {item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(' · ')}
              </Text>
            ) : null}
            {item.note ? (
              <Text selectable style={[typeScale.body, { color: palette.muted }]}>
                {language === 'th' ? 'หมายเหตุ' : 'Note'}: {item.note}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
              <QuantityButton
                label={language === 'th' ? `ลดจำนวน ${item.menu_name}` : `Decrease ${item.menu_name} quantity`}
                icon="remove"
                disabled={saving || quantity <= 1}
                onPress={() => setQuantity((current) => Math.max(1, current - 1))}
              />
              <View style={{ minWidth: 64, alignItems: 'center', gap: 1 }}>
                <Text selectable style={[typeScale.number, { fontSize: 24 }]}>{quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</Text>
                <Text style={[typeScale.caption, { color: palette.muted }]}>{language === 'th' ? 'จำนวน' : 'Quantity'}</Text>
              </View>
              <QuantityButton
                label={language === 'th' ? `เพิ่มจำนวน ${item.menu_name}` : `Increase ${item.menu_name} quantity`}
                icon="add"
                disabled={saving || quantity >= 100}
                onPress={() => setQuantity((current) => Math.min(100, current + 1))}
              />
            </View>
          </Surface>
        </>
      ) : (
        <EmptyState
          title={language === 'th' ? 'รายการนี้ไม่อยู่ในรอบปัจจุบันแล้ว' : 'This item is no longer in the current round'}
        />
      )}
    </AppScreen>
  );
}
