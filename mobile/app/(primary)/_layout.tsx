import { Redirect } from 'expo-router';
import {
  TabList,
  TabSlot,
  TabTrigger,
  useTabsWithChildren,
  type TabsDescriptor,
  type TabsSlotRenderOptions,
} from 'expo-router/ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';

import {
  isAllowed,
  PrimaryPhoneNavigation,
  PrimaryTabletRail,
  primaryNavigation,
} from '@/src/components/app-shell';
import { useReducedMotion } from '@/src/components/motion';
import {
  PrimaryTabSceneProvider,
  PrimaryTabsHostProvider,
  PrimaryTabSwipeGestureProvider,
} from '@/src/components/primary-tabs-runtime';
import {
  getAdjacentNavigationTarget,
  getNavigationIndexByRouteName,
  PAGER_SWIPE_MIN_DISTANCE,
  resolvePagerAnimationSettlement,
  resolvePagerSwipeSettlement,
} from '@/src/lib/navigation-runtime';
import { useAuth } from '@/src/providers/auth-provider';
import { breakpoints, palette } from '@/src/theme';

const PAGER_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const PAGER_START_TIMEOUT_MS = 500;
const PAGER_SETTLE_GRACE_MS = 220;
const ROUTE_SYNC_TIMEOUT_MS = 900;

const hiddenTabListStyle = {
  position: 'absolute' as const,
  width: 0,
  height: 0,
  opacity: 0,
  pointerEvents: 'none' as const,
};

function PrimaryPagerScene({
  active,
  activeIndex,
  children,
  index,
  pagerPosition,
  routeKey,
  viewportWidth,
}: {
  active: boolean;
  activeIndex: number;
  children: ReactNode;
  index: number;
  pagerPosition: Animated.Value;
  routeKey: string;
  viewportWidth: number;
}) {
  const translateX = useMemo(
    () => Animated.multiply(
      Animated.subtract(index, pagerPosition),
      viewportWidth,
    ),
    [index, pagerPosition, viewportWidth],
  );

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      aria-hidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      key={routeKey}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: viewportWidth,
        pointerEvents: active ? 'auto' : 'none',
        transform: [{ translateX }],
      }}
    >
      <PrimaryTabsHostProvider>
        <PrimaryTabSceneProvider status={
          active
            ? 'active'
            : Math.abs(index - activeIndex) === 1
              ? 'adjacent'
              : 'inactive'
        }>
          {children}
        </PrimaryTabSceneProvider>
      </PrimaryTabsHostProvider>
    </Animated.View>
  );
}

function PrimaryTabsNavigator() {
  const tabs = useTabsWithChildren({
    backBehavior: 'none',
    children: (
      <TabList
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={hiddenTabListStyle}
      >
        {primaryNavigation.map((item) => (
          <TabTrigger href={item.href as never} key={item.key} name={item.key} />
        ))}
      </TabList>
    ),
  });
  const { NavigationContent } = tabs;

  return (
    <NavigationContent>
      <PrimaryPager tabs={tabs} />
    </NavigationContent>
  );
}

function PrimaryPager({
  tabs,
}: {
  tabs: ReturnType<typeof useTabsWithChildren>;
}) {
  const { width } = useWindowDimensions();
  const { activeMembership, status, user } = useAuth();
  const reducedMotion = useReducedMotion();
  const isTablet = width >= breakpoints.tablet;
  const expandedRail = width >= breakpoints.expandedRail;
  const screenBackground = isTablet ? palette.canvas : palette.surface;
  const railWidth = expandedRail ? 232 : 92;
  const viewportWidth = Math.max(width - (isTablet ? railWidth : 0), 1);
  const useNativeDriver = Platform.OS !== 'web';
  const permittedItems = useMemo(
    () => primaryNavigation.filter((item) => isAllowed(item, activeMembership)),
    [activeMembership],
  );
  const permittedKeys = permittedItems.map((item) => item.key).join('|');
  const activeRouteName = tabs.state.routes[tabs.state.index]?.name;
  const activeIndex = getNavigationIndexByRouteName(
    permittedItems,
    activeRouteName,
  );
  const activeItem = permittedItems[activeIndex];
  const pagerPosition = useRef(
    new Animated.Value(Math.max(activeIndex, 0)),
  ).current;
  const pagerPositionRef = useRef(Math.max(activeIndex, 0));
  const activeIndexRef = useRef(activeIndex);
  const permittedItemsRef = useRef(permittedItems);
  const transitionIdRef = useRef(0);
  const transitionActiveRef = useRef(false);
  const nestedHorizontalGestureActive = useRef(false);
  const pagerSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [presentedIndex, setPresentedIndex] = useState(activeIndex);
  activeIndexRef.current = activeIndex;
  permittedItemsRef.current = permittedItems;

  const clearRouteSyncTimer = useCallback(() => {
    if (!routeSyncTimer.current) return;
    clearTimeout(routeSyncTimer.current);
    routeSyncTimer.current = null;
  }, []);

  const clearPagerSettleTimer = useCallback(() => {
    if (!pagerSettleTimer.current) return;
    clearTimeout(pagerSettleTimer.current);
    pagerSettleTimer.current = null;
  }, []);

  const writePagerPosition = useCallback((position: number) => {
    pagerPositionRef.current = position;
    pagerPosition.setValue(position);
  }, [pagerPosition]);

  const restoreCommittedPager = useCallback((transitionId?: number) => {
    if (
      transitionId !== undefined &&
      transitionId !== transitionIdRef.current
    ) return;

    transitionIdRef.current += 1;
    transitionActiveRef.current = false;
    clearPagerSettleTimer();
    clearRouteSyncTimer();
    pagerPosition.stopAnimation();
    const committedIndex = activeIndexRef.current;
    if (committedIndex < 0) return;
    writePagerPosition(committedIndex);
    setPresentedIndex(committedIndex);
  }, [clearPagerSettleTimer, clearRouteSyncTimer, pagerPosition, writePagerPosition]);

  useLayoutEffect(() => {
    transitionIdRef.current += 1;
    transitionActiveRef.current = false;
    nestedHorizontalGestureActive.current = false;
    clearPagerSettleTimer();
    clearRouteSyncTimer();
    pagerPosition.stopAnimation();
    if (activeIndex >= 0) writePagerPosition(activeIndex);
    setPresentedIndex(activeIndex);
  }, [activeIndex, clearPagerSettleTimer, clearRouteSyncTimer, pagerPosition, permittedKeys, writePagerPosition]);

  useEffect(() => () => {
    transitionIdRef.current += 1;
    clearPagerSettleTimer();
    clearRouteSyncTimer();
    pagerPosition.stopAnimation();
  }, [clearPagerSettleTimer, clearRouteSyncTimer, pagerPosition]);

  const commitTabNavigation = useCallback((targetKey: string) => {
    const target = permittedItemsRef.current.find((item) => item.key === targetKey);
    if (!target) return false;
    tabs.navigation.dispatch({
      type: 'JUMP_TO',
      payload: { name: target.key },
    });
    return true;
  }, [tabs.navigation]);

  const animatePagerTo = useCallback((
    targetIndex: number,
    navigateAfterAnimation: boolean,
    knownCurrentPosition?: number,
  ) => {
    const target = permittedItems[targetIndex];
    if (!target) return;

    const transitionId = ++transitionIdRef.current;
    const targetKey = target.key;
    setPresentedIndex(targetIndex);
    transitionActiveRef.current = true;
    clearPagerSettleTimer();
    clearRouteSyncTimer();

    const armPagerSettleWatchdog = (delay: number) => {
      clearPagerSettleTimer();
      pagerSettleTimer.current = setTimeout(() => {
        restoreCommittedPager(transitionId);
      }, delay);
    };
    armPagerSettleWatchdog(PAGER_START_TIMEOUT_MS);

    const finish = () => {
      if (transitionId !== transitionIdRef.current) return;
      clearPagerSettleTimer();
      if (!navigateAfterAnimation || targetIndex === activeIndexRef.current) {
        transitionActiveRef.current = false;
        return;
      }

      routeSyncTimer.current = setTimeout(() => {
        restoreCommittedPager(transitionId);
      }, ROUTE_SYNC_TIMEOUT_MS);

      if (!commitTabNavigation(targetKey)) {
        restoreCommittedPager(transitionId);
      }
    };

    const startAnimation = (currentPosition: number) => {
      if (transitionId !== transitionIdRef.current) return;
      clearPagerSettleTimer();
      const safeCurrentPosition = Number.isFinite(currentPosition)
        ? currentPosition
        : Math.max(activeIndexRef.current, 0);
      writePagerPosition(safeCurrentPosition);
      const travel = Math.abs(targetIndex - safeCurrentPosition);

      if (reducedMotion || isTablet || travel < 0.001) {
        writePagerPosition(targetIndex);
        finish();
        return;
      }

      const duration = navigateAfterAnimation
        ? Math.min(280, 180 + Math.ceil(travel) * 40)
        : 180;
      armPagerSettleWatchdog(duration + PAGER_SETTLE_GRACE_MS);
      Animated.timing(pagerPosition, {
        toValue: targetIndex,
        duration,
        easing: PAGER_EASING,
        useNativeDriver,
      }).start(({ finished }) => {
        const settlement = resolvePagerAnimationSettlement({
          committedIndex: Math.max(activeIndexRef.current, 0),
          finished,
          ownsTransition: transitionId === transitionIdRef.current,
          targetIndex,
        });
        if (!settlement) return;
        clearPagerSettleTimer();
        writePagerPosition(settlement.position);
        if (!settlement.completed) {
          transitionActiveRef.current = false;
          setPresentedIndex(settlement.position);
          return;
        }
        finish();
      });
    };

    if (knownCurrentPosition !== undefined) {
      pagerPosition.stopAnimation();
      startAnimation(knownCurrentPosition);
      return;
    }
    pagerPosition.stopAnimation(startAnimation);
  }, [clearPagerSettleTimer, clearRouteSyncTimer, commitTabNavigation, isTablet, pagerPosition, permittedItems, reducedMotion, restoreCommittedPager, useNativeDriver, writePagerPosition]);

  const navigateToTab = useCallback((targetIndex: number) => {
    if (!permittedItems[targetIndex] || activeIndex < 0) return;
    animatePagerTo(targetIndex, targetIndex !== activeIndex);
  }, [activeIndex, animatePagerTo, permittedItems]);

  const finishGesture = useCallback((
    _: GestureResponderEvent,
    gesture: PanResponderGestureState,
  ) => {
    const settlement = resolvePagerSwipeSettlement(
      permittedItems,
      activeIndex,
      {
        deltaX: gesture.dx,
        deltaY: gesture.dy,
        velocityX: gesture.vx * 1000,
      },
      viewportWidth,
    );
    if (!settlement) {
      restoreCommittedPager();
      return;
    }
    animatePagerTo(
      settlement.targetIndex,
      settlement.shouldNavigate,
      pagerPositionRef.current,
    );
  }, [activeIndex, animatePagerTo, permittedItems, restoreCommittedPager, viewportWidth]);

  const pagerResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (
        isTablet ||
        transitionActiveRef.current ||
        nestedHorizontalGestureActive.current ||
        activeIndex < 0 ||
        permittedItems.length < 2 ||
        gesture.numberActiveTouches > 1
      ) return false;
      const horizontalDistance = Math.abs(gesture.dx);
      const verticalDistance = Math.abs(gesture.dy);
      return horizontalDistance >= PAGER_SWIPE_MIN_DISTANCE &&
        horizontalDistance > verticalDistance * 1.35;
    },
    onPanResponderGrant: () => {
      transitionIdRef.current += 1;
      transitionActiveRef.current = false;
      clearPagerSettleTimer();
      clearRouteSyncTimer();
      pagerPosition.stopAnimation();
      writePagerPosition(Math.max(activeIndex, 0));
      setPresentedIndex(activeIndex);
    },
    onPanResponderMove: (_, gesture) => {
      if (reducedMotion || activeIndex < 0) return;
      const direction = gesture.dx < 0 ? 1 : -1;
      const adjacent = getAdjacentNavigationTarget(
        permittedItems,
        activeIndex,
        direction,
      );
      const resistance = adjacent ? 1 : 0.18;
      const resistedDrag = gesture.dx * resistance;
      const boundedDrag = Math.max(
        -viewportWidth,
        Math.min(viewportWidth, resistedDrag),
      );
      writePagerPosition(Math.max(
        0,
        Math.min(
          permittedItems.length - 1,
          activeIndex - boundedDrag / viewportWidth,
        ),
      ));
    },
    onPanResponderRelease: finishGesture,
    onPanResponderTerminate: () => animatePagerTo(
      activeIndex,
      false,
      pagerPositionRef.current,
    ),
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
  }), [activeIndex, animatePagerTo, clearPagerSettleTimer, clearRouteSyncTimer, finishGesture, isTablet, pagerPosition, permittedItems, reducedMotion, viewportWidth, writePagerPosition]);

  const renderTabScene = useCallback((
    descriptor: TabsDescriptor,
    _options: TabsSlotRenderOptions,
  ) => {
    const index = getNavigationIndexByRouteName(
      permittedItems,
      descriptor.route.name,
    );
    if (index < 0) return null;
    const active = index === activeIndex;

    return (
      <PrimaryPagerScene
        active={active}
        activeIndex={activeIndex}
        index={index}
        pagerPosition={pagerPosition}
        routeKey={descriptor.route.key}
        viewportWidth={viewportWidth}
      >
        {descriptor.render()}
      </PrimaryPagerScene>
    );
  }, [activeIndex, pagerPosition, permittedItems, viewportWidth]);

  if (status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: screenBackground }} />;
  }
  if (!user) return <Redirect href="/login" />;
  if (!activeMembership) return <Redirect href="/restaurants" />;
  if (!activeItem) {
    return <Redirect href={permittedItems[0]?.href as never || '/more'} />;
  }

  const pager = (
    <View
      {...(!isTablet ? pagerResponder.panHandlers : {})}
      style={{ minHeight: 0, flex: 1, overflow: 'hidden', backgroundColor: screenBackground }}
    >
      <TabSlot
        detachInactiveScreens={false}
        renderFn={renderTabScene}
        style={{ flex: 1 }}
      />
    </View>
  );

  return (
    <PrimaryTabSwipeGestureProvider
      setNestedHorizontalGestureActive={(active) => {
        nestedHorizontalGestureActive.current = active;
      }}
    >
      <View style={{ flex: 1, flexDirection: isTablet ? 'row' : 'column', backgroundColor: screenBackground }}>
        {isTablet ? (
          <PrimaryTabletRail
            expanded={expandedRail}
            onSelectPrimary={(item) => {
              navigateToTab(permittedItems.findIndex(
                (candidate) => candidate.key === item.key,
              ));
            }}
          />
        ) : null}
        <View style={{ minWidth: 0, flex: 1 }}>
          {pager}
          {!isTablet ? (
            <PrimaryPhoneNavigation
              accessibilitySelectedIndex={activeIndex}
              items={permittedItems}
              markerPosition={pagerPosition}
              onSelect={navigateToTab}
              selectedIndex={presentedIndex}
            />
          ) : null}
        </View>
      </View>
    </PrimaryTabSwipeGestureProvider>
  );
}

export default function PrimaryTabsLayout() {
  return <PrimaryTabsNavigator />;
}
