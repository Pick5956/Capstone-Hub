import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  PanResponder,
  Pressable,
  View,
} from 'react-native';

import { listMenuItems } from '@/src/api/menu';
import { deleteOrderItem, getOrder, sendOrderToKitchen } from '@/src/api/order';
import { AppIcon } from '@/src/components/app-icon';
import { AppText as Text } from '@/src/components/app-text';
import { AppScreen } from '@/src/components/app-shell';
import { MenuImage } from '@/src/components/menu-image';
import { useReducedMotion } from '@/src/components/motion';
import { ActionDock, EdgeSection, EmptyState, Feedback } from '@/src/components/ui';
import { money } from '@/src/lib/format';
import {
  CURRENT_ROUND_BAR_COLORS,
  CURRENT_ROUND_REVEAL_WIDTH,
  clampCurrentRoundRowOffset,
  createOrderDetailRequestGuard,
  currentRoundPresentation,
  lockCurrentRoundRowSwipeAxis,
  nextOpenCurrentRoundItemId,
  resolveCurrentRoundRowDragOffset,
  resolveCurrentRoundRowInteraction,
  resolveCurrentRoundRowRelease,
  selectOrderItemImage,
  summarizeCurrentRound,
  type CurrentRoundRowSwipeAxis,
} from '@/src/lib/order-detail-runtime';
import { createRequestGeneration } from '@/src/lib/request-generation';
import { can } from '@/src/lib/rbac';
import { useAuth } from '@/src/providers/auth-provider';
import { useDisplayPreferences } from '@/src/providers/display-preferences-provider';
import { palette, spacing } from '@/src/theme';
import type { Order } from '@/src/types/order';

function SwipeToDeleteRow({
  itemId,
  open,
  disabled,
  editLabel,
  editHint,
  deleteLabel,
  deleteAccessibilityLabel,
  onOpen,
  onClose,
  onEdit,
  onDelete,
  onSwipeStart,
  onSwipeEnd,
  children,
}: {
  itemId: number;
  open: boolean;
  disabled: boolean;
  editLabel: string;
  editHint: string;
  deleteLabel: string;
  deleteAccessibilityLabel: string;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSwipeStart: (itemId: number) => void;
  onSwipeEnd: (itemId: number) => void;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const translateX = useRef(new Animated.Value(open ? -CURRENT_ROUND_REVEAL_WIDTH : 0)).current;
  const offsetRef = useRef(open ? -CURRENT_ROUND_REVEAL_WIDTH : 0);
  const gestureStartRef = useRef(offsetRef.current);
  const activationDxRef = useRef(0);
  const axisRef = useRef<CurrentRoundRowSwipeAxis>('undecided');
  const didDragRef = useRef(false);
  const responderActiveRef = useRef(false);
  const settleAnimatingRef = useRef(false);
  const settleTargetRef = useRef<number | null>(offsetRef.current);
  const latestRef = useRef({
    open,
    disabled,
    onOpen,
    onClose,
    onSwipeStart,
    onSwipeEnd,
  });
  latestRef.current = { open, disabled, onOpen, onClose, onSwipeStart, onSwipeEnd };

  useEffect(() => {
    const listenerId = translateX.addListener(({ value }) => {
      offsetRef.current = clampCurrentRoundRowOffset(value);
    });
    return () => translateX.removeListener(listenerId);
  }, [translateX]);

  const settle = useCallback((nextOpen: boolean) => {
    const target = nextOpen ? -CURRENT_ROUND_REVEAL_WIDTH : 0;
    if (settleAnimatingRef.current && settleTargetRef.current === target) return;

    settleTargetRef.current = target;
    translateX.stopAnimation((value) => {
      const current = clampCurrentRoundRowOffset(value);
      offsetRef.current = current;
      if (reducedMotion || Math.abs(current - target) < 0.5) {
        settleAnimatingRef.current = false;
        offsetRef.current = target;
        translateX.setValue(target);
        return;
      }

      settleAnimatingRef.current = true;
      Animated.timing(translateX, {
        toValue: target,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && settleTargetRef.current === target) {
          settleAnimatingRef.current = false;
          offsetRef.current = target;
        }
      });
    });
  }, [reducedMotion, translateX]);

  useEffect(() => settle(open), [open, settle]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => {
      axisRef.current = 'undecided';
      activationDxRef.current = 0;
      didDragRef.current = false;
      return false;
    },
    onMoveShouldSetPanResponder: (_, gesture) => {
      const previousAxis = axisRef.current;
      const nextAxis = lockCurrentRoundRowSwipeAxis(previousAxis, {
        deltaX: gesture.dx,
        deltaY: gesture.dy,
      }, latestRef.current.open, latestRef.current.disabled);
      axisRef.current = nextAxis;
      if (previousAxis !== 'horizontal' && nextAxis === 'horizontal') {
        activationDxRef.current = gesture.dx;
      }
      return nextAxis === 'horizontal';
    },
    onPanResponderGrant: () => {
      responderActiveRef.current = true;
      didDragRef.current = true;
      settleAnimatingRef.current = false;
      settleTargetRef.current = null;
      latestRef.current.onSwipeStart(itemId);
      translateX.stopAnimation((value) => {
        const current = clampCurrentRoundRowOffset(value);
        gestureStartRef.current = current;
        const activated = clampCurrentRoundRowOffset(current + activationDxRef.current);
        offsetRef.current = activated;
        translateX.setValue(activated);
      });
    },
    onPanResponderMove: (_, gesture) => {
      const nextOffset = resolveCurrentRoundRowDragOffset({
        startOffset: gestureStartRef.current,
        activationDeltaX: activationDxRef.current,
        responderDeltaX: gesture.dx,
      });
      offsetRef.current = nextOffset;
      translateX.setValue(nextOffset);
    },
    onPanResponderRelease: (_, gesture) => {
      responderActiveRef.current = false;
      latestRef.current.onSwipeEnd(itemId);
      const settlement = resolveCurrentRoundRowRelease({
        offset: offsetRef.current,
        velocityX: gesture.vx * 1000,
      });
      if (settlement === 'open') latestRef.current.onOpen();
      else latestRef.current.onClose();
      settle(settlement === 'open');
    },
    onPanResponderTerminate: () => {
      responderActiveRef.current = false;
      latestRef.current.onSwipeEnd(itemId);
      settle(latestRef.current.open);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [itemId, settle, translateX]);

  const handlePress = () => {
    const interaction = resolveCurrentRoundRowInteraction({
      wasHorizontalDrag: didDragRef.current,
      isOpen: open,
    });
    if (interaction === 'close') onClose();
    if (interaction === 'edit') onEdit();
  };

  return (
    <View style={{ overflow: 'hidden', backgroundColor: palette.danger }}>
      <View
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        pointerEvents={open ? 'auto' : 'none'}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: CURRENT_ROUND_REVEAL_WIDTH }}
      >
        <Pressable
          accessibilityLabel={deleteAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onDelete}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.danger,
            opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
          })}
        >
          <Text style={{ color: palette.primaryText, fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{deleteLabel}</Text>
        </Pressable>
      </View>
      <Animated.View
        {...responder.panHandlers}
        style={{ backgroundColor: palette.surface, transform: [{ translateX }] }}
      >
        <Pressable
          accessibilityActions={[
            { name: 'activate', label: editLabel },
            { name: 'delete', label: deleteAccessibilityLabel },
          ]}
          accessibilityHint={editHint}
          accessibilityLabel={editLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onAccessibilityAction={(event) => {
            if (disabled) return;
            if (event.nativeEvent.actionName === 'activate') onEdit();
            if (event.nativeEvent.actionName === 'delete') onDelete();
          }}
          onPress={handlePress}
          onPressIn={() => {
            if (!responderActiveRef.current) didDragRef.current = false;
          }}
          style={({ pressed }) => ({
            backgroundColor: pressed && !open ? palette.surfaceSubtle : palette.surface,
            opacity: disabled ? 0.55 : 1,
          })}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function SendCurrentRoundAction({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: CURRENT_ROUND_BAR_COLORS.borderColor,
        borderRadius: 8,
        backgroundColor: CURRENT_ROUND_BAR_COLORS.backgroundColor,
        paddingHorizontal: spacing.lg,
        opacity: disabled || loading ? 0.5 : pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      {loading ? (
        <ActivityIndicator color={CURRENT_ROUND_BAR_COLORS.foregroundColor} size="small" />
      ) : (
        <>
          <Text style={{ color: CURRENT_ROUND_BAR_COLORS.foregroundColor, fontSize: 14, fontWeight: '700' }}>{label}</Text>
          <AppIcon color={CURRENT_ROUND_BAR_COLORS.foregroundColor} name="arrow-forward" size={17} />
        </>
      )}
    </Pressable>
  );
}

export default function CurrentRoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const validOrderId = Number.isInteger(orderId) && orderId > 0;
  const { activeMembership } = useAuth();
  const { language } = useDisplayPreferences();
  const canTakeOrder = can(activeMembership, 'take_order');
  const [order, setOrder] = useState<Order | null>(null);
  const [menuImageById, setMenuImageById] = useState<ReadonlyMap<number, string>>(new Map());
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [activeSwipeItemId, setActiveSwipeItemId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createOrderDetailRequestGuard(createRequestGeneration()));

  const pendingItems = useMemo(
    () => (order?.items ?? []).filter((item) => item.status === 'pending'),
    [order?.items],
  );
  const summary = useMemo(() => summarizeCurrentRound(order?.items), [order?.items]);
  const presentation = useMemo(() => currentRoundPresentation(summary, language), [language, summary]);
  const locked = order?.status === 'completed' || order?.status === 'cancelled';

  const load = useCallback(async (quiet = false) => {
    if (!canTakeOrder || !validOrderId) {
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
      if (quiet) {
        const nextOrder = await getOrder(orderId);
        if (requestGuardRef.current.canApplyLoad(request)) setOrder(nextOrder);
      } else {
        const [nextOrder, menuResponse] = await Promise.all([
          getOrder(orderId),
          listMenuItems().catch(() => ({ menu_items: [] })),
        ]);
        if (requestGuardRef.current.canApplyLoad(request)) {
          setOrder(nextOrder);
          setMenuImageById(new Map(
            (menuResponse.menu_items ?? [])
              .filter((item) => Boolean(item.image_url?.trim()))
              .map((item) => [item.ID, item.image_url]),
          ));
        }
      }
    } catch (err) {
      if (!quiet && requestGuardRef.current.canApplyLoad(request)) {
        setError(err instanceof Error ? err.message : language === 'th' ? 'โหลดรายการรอบนี้ไม่สำเร็จ' : 'Could not load the current round');
      }
    } finally {
      if (!quiet && requestGuardRef.current.canApplyLoad(request)) setLoading(false);
    }
  }, [canTakeOrder, language, orderId, validOrderId]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => void load(true), 10000);
    return () => {
      clearInterval(timer);
      requestGuardRef.current.invalidateLoads();
      setOpenItemId(null);
      setActiveSwipeItemId(null);
    };
  }, [load]));

  useEffect(() => {
    if (openItemId !== null && !pendingItems.some((item) => item.ID === openItemId)) {
      setOpenItemId(null);
    }
    if (activeSwipeItemId !== null && !pendingItems.some((item) => item.ID === activeSwipeItemId)) {
      setActiveSwipeItemId(null);
    }
  }, [activeSwipeItemId, openItemId, pendingItems]);

  const beginRowSwipe = useCallback((itemId: number) => {
    setActiveSwipeItemId(itemId);
    setOpenItemId((current) => current === itemId ? current : null);
  }, []);

  const endRowSwipe = useCallback((itemId: number) => {
    setActiveSwipeItemId((current) => current === itemId ? null : current);
  }, []);

  async function mutate(action: () => Promise<Order>) {
    if (!requestGuardRef.current.beginMutation()) return false;

    let succeeded = false;
    setSubmitting(true);
    setError(null);
    try {
      setOrder(await action());
      succeeded = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : language === 'th' ? 'ทำรายการไม่สำเร็จ' : 'Could not complete this action');
    } finally {
      requestGuardRef.current.finishMutation();
      setSubmitting(false);
    }
    if (!succeeded) void load(true);
    return succeeded;
  }

  async function deleteCurrentItem(itemId: number, itemName: string) {
    const deleted = await mutate(() => deleteOrderItem(orderId, itemId));
    if (!deleted) return;
    setOpenItemId((current) => nextOpenCurrentRoundItemId(current, { type: 'deleted', itemId }));
    AccessibilityInfo.announceForAccessibility(
      language === 'th' ? `ลบ ${itemName} แล้ว` : `${itemName} deleted`,
    );
  }

  async function sendCurrentRound() {
    if (!order || locked || summary.quantity <= 0) return;
    const sent = await mutate(() => sendOrderToKitchen(orderId));
    if (sent) router.back();
  }

  if (!canTakeOrder) {
    return (
      <AppScreen title={language === 'th' ? 'รายการรอบนี้' : 'Current round'} topLevel={false}>
        <EmptyState title={language === 'th' ? 'ไม่มีสิทธิ์รับออเดอร์' : 'No order-taking permission'} />
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

  const footer = order && summary.quantity > 0 ? (
    <ActionDock label={presentation.totalLabel} value={money(summary.subtotal, language)}>
      <SendCurrentRoundAction
        label={presentation.sendLabel}
        loading={submitting}
        disabled={Boolean(locked)}
        onPress={sendCurrentRound}
      />
    </ActionDock>
  ) : undefined;

  return (
    <AppScreen
      title={order
        ? order.table?.display_label || (order.order_type === 'takeaway'
          ? language === 'th' ? 'ซื้อกลับบ้าน' : 'Takeaway'
          : order.order_number)
        : language === 'th' ? 'ออเดอร์' : 'Order'}
      subtitle={presentation.title}
      topLevel={false}
      footer={footer}
      scroll={false}
    >
      <View style={{ minHeight: 0, flex: 1, gap: spacing.md }}>
        {error ? <Feedback title={language === 'th' ? 'ทำรายการไม่ได้' : 'Could not complete this action'} detail={error} tone="danger" /> : null}
        {loading ? (
          <EmptyState title={language === 'th' ? 'กำลังโหลดรายการรอบนี้' : 'Loading current round'} />
        ) : pendingItems.length ? (
          <EdgeSection style={{ flex: 1, borderWidth: 0, borderRadius: 0 }}>
            <FlatList
              data={pendingItems}
              directionalLockEnabled
              scrollEnabled={activeSwipeItemId === null}
              showsVerticalScrollIndicator={false}
              keyExtractor={(item) => String(item.ID)}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, marginLeft: spacing.lg + 56 + spacing.md, backgroundColor: palette.border }} />
              )}
              onScrollBeginDrag={() => setOpenItemId(null)}
              contentContainerStyle={{ paddingBottom: spacing.lg }}
              renderItem={({ item }) => {
                const imagePath = selectOrderItemImage({
                  menuId: item.menu_id,
                  menuImageUrl: item.menu?.image_url,
                }, menuImageById);
                const quantityLabel = item.quantity.toLocaleString(language === 'th' ? 'th-TH' : 'en-US');
                const editLabel = language === 'th'
                  ? `แก้ไข ${item.menu_name} จำนวน ${quantityLabel} รายการ`
                  : `Edit ${item.menu_name}, quantity ${quantityLabel}`;
                const deleteLabel = language === 'th' ? 'ลบ' : 'Delete';
                const deleteAccessibilityLabel = language === 'th'
                  ? `ลบรายการ ${item.menu_name}`
                  : `Delete ${item.menu_name}`;
                return (
                  <SwipeToDeleteRow
                    itemId={item.ID}
                    open={openItemId === item.ID}
                    disabled={submitting || Boolean(locked)}
                    editLabel={editLabel}
                    editHint={language === 'th'
                      ? 'แตะเพื่อแก้จำนวน หรือปัดไปทางซ้ายเพื่อแสดงปุ่มลบ'
                      : 'Tap to edit quantity, or swipe left to reveal Delete'}
                    deleteLabel={deleteLabel}
                    deleteAccessibilityLabel={deleteAccessibilityLabel}
                    onOpen={() => setOpenItemId((current) => nextOpenCurrentRoundItemId(current, { type: 'open', itemId: item.ID }))}
                    onClose={() => setOpenItemId((current) => nextOpenCurrentRoundItemId(current, { type: 'close', itemId: item.ID }))}
                    onEdit={() => router.push({ pathname: '/order/current-item' as never, params: { id: String(orderId), itemId: String(item.ID) } } as never)}
                    onDelete={() => { void deleteCurrentItem(item.ID, item.menu_name); }}
                    onSwipeStart={beginRowSwipe}
                    onSwipeEnd={endRowSwipe}
                  >
                    <View style={{ minHeight: 88, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 }}>
                      <MenuImage
                        accessible={false}
                        imageUrl={imagePath}
                        variant="row"
                      />
                      <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
                        <Text numberOfLines={2} style={{ color: palette.textStrong, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{item.menu_name}</Text>
                        {item.selected_options?.length ? (
                          <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 12, lineHeight: 20 }}>
                            {item.selected_options.map((option) => `${option.group_name}: ${option.option_name}`).join(' · ')}
                          </Text>
                        ) : null}
                        {item.note ? <Text numberOfLines={2} style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{item.note}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                        <Text style={{ color: palette.textStrong, fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{money(item.subtotal, language)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                          <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>x{quantityLabel}</Text>
                          <AppIcon color={palette.muted} name="chevron-forward" size={15} />
                        </View>
                      </View>
                    </View>
                  </SwipeToDeleteRow>
                );
              }}
            />
          </EdgeSection>
        ) : (
          <EmptyState title={presentation.empty} />
        )}
      </View>
    </AppScreen>
  );
}
