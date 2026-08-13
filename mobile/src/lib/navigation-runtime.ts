type StackResetRouter<Href> = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: Href) => void;
};

export type HorizontalSwipeDirection = -1 | 1;

export type HorizontalSwipeSample = Readonly<{
  deltaX: number;
  deltaY: number;
  velocityX?: number;
}>;

export type HorizontalSwipeThresholds = Readonly<{
  distance?: number;
  velocity?: number;
  dominanceRatio?: number;
}>;

export type NavigationItemWithHref<Href> = Readonly<{
  href: Href;
}>;

export type NavigationItemWithRouteName = Readonly<{
  key: string;
  href: string;
}>;

export type AdjacentNavigationTarget<Href> = Readonly<{
  index: number;
  href: Href;
}>;

export type PagerSwipeSettlement = Readonly<{
  targetIndex: number;
  shouldNavigate: boolean;
}>;

export type PagerAnimationSettlement = Readonly<{
  completed: boolean;
  position: number;
}>;

export type PhoneNavigationIndicatorMetrics = Readonly<{
  indicatorInset: number;
  indicatorWidth: number;
  slotWidth: number;
}>;

const DEFAULT_SWIPE_DISTANCE = 48;
const DEFAULT_SWIPE_VELOCITY = 600;
const DEFAULT_SWIPE_DOMINANCE_RATIO = 1.25;
const PAGER_SWIPE_COMMIT_FRACTION = 0.5;
export const PAGER_SWIPE_MIN_DISTANCE = 5;
const PAGER_FLICK_MIN_VELOCITY = 300;

export function resetRouteStack<Href>(router: StackResetRouter<Href>, href: Href) {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace(href);
}

export function resolvePhoneNavigationIndicatorMetrics(
  dockWidth: number,
  itemCount: number,
  desiredInset: number,
): PhoneNavigationIndicatorMetrics | null {
  if (
    !Number.isFinite(dockWidth) ||
    dockWidth <= 0 ||
    !Number.isInteger(itemCount) ||
    itemCount <= 0 ||
    !Number.isFinite(desiredInset) ||
    desiredInset < 0
  ) {
    return null;
  }

  const slotWidth = dockWidth / itemCount;
  const indicatorInset = Math.min(desiredInset, slotWidth / 2);

  return {
    indicatorInset,
    indicatorWidth: Math.max(slotWidth - indicatorInset * 2, 0),
    slotWidth,
  };
}

export function shouldOpenSettings(pathname: string) {
  return pathname !== '/settings' && !pathname.startsWith('/settings/');
}

export function classifyHorizontalSwipe(
  { deltaX, deltaY, velocityX = 0 }: HorizontalSwipeSample,
  {
    distance = DEFAULT_SWIPE_DISTANCE,
    velocity = DEFAULT_SWIPE_VELOCITY,
    dominanceRatio = DEFAULT_SWIPE_DOMINANCE_RATIO,
  }: HorizontalSwipeThresholds = {},
): HorizontalSwipeDirection | null {
  if (![deltaX, deltaY, velocityX].every(Number.isFinite)) {
    return null;
  }

  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  const requiredDominance = Math.max(1, dominanceRatio);

  if (
    horizontalDistance <= verticalDistance * requiredDominance ||
    (horizontalDistance < Math.max(0, distance) &&
      Math.abs(velocityX) < Math.max(0, velocity))
  ) {
    return null;
  }

  return deltaX < 0 ? 1 : -1;
}

export function getAdjacentNavigationTarget<Href>(
  items: readonly NavigationItemWithHref<Href>[],
  activeIndex: number,
  direction: HorizontalSwipeDirection,
): AdjacentNavigationTarget<Href> | null {
  if (
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= items.length
  ) {
    return null;
  }

  const index = activeIndex + direction;
  const item = items[index];

  return item ? { index, href: item.href } : null;
}

export function resolvePagerSwipeSettlement<Href>(
  items: readonly NavigationItemWithHref<Href>[],
  activeIndex: number,
  sample: HorizontalSwipeSample,
  viewportWidth: number,
): PagerSwipeSettlement | null {
  if (
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= items.length ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0
  ) {
    return null;
  }

  const commitDistance = viewportWidth * PAGER_SWIPE_COMMIT_FRACTION;
  const { deltaX, deltaY, velocityX = 0 } = sample;
  const horizontalDistance = Math.abs(deltaX);
  const hasMatchingFlickDirection = Math.sign(velocityX) === Math.sign(deltaX);
  const isFastFlick = horizontalDistance >= PAGER_SWIPE_MIN_DISTANCE &&
    Number.isFinite(velocityX) &&
    Math.abs(velocityX) >= PAGER_FLICK_MIN_VELOCITY &&
    hasMatchingFlickDirection;
  const direction = horizontalDistance >= commitDistance
    ? classifyHorizontalSwipe(
      { deltaX, deltaY },
      { distance: commitDistance },
    )
    : isFastFlick
      ? classifyHorizontalSwipe(
        { deltaX, deltaY, velocityX },
        {
          distance: commitDistance,
          velocity: PAGER_FLICK_MIN_VELOCITY,
        },
      )
      : null;
  const adjacent = direction
    ? getAdjacentNavigationTarget(items, activeIndex, direction)
    : null;

  return adjacent
    ? { targetIndex: adjacent.index, shouldNavigate: true }
    : { targetIndex: activeIndex, shouldNavigate: false };
}

export function resolvePagerAnimationSettlement({
  committedIndex,
  finished,
  ownsTransition,
  targetIndex,
}: {
  committedIndex: number;
  finished: boolean;
  ownsTransition: boolean;
  targetIndex: number;
}): PagerAnimationSettlement | null {
  if (!ownsTransition) return null;

  return finished
    ? { completed: true, position: targetIndex }
    : { completed: false, position: committedIndex };
}

export function getNavigationIndexByRouteName(
  items: readonly NavigationItemWithRouteName[],
  routeName: string | null | undefined,
): number {
  if (!routeName) return -1;

  const normalizedRouteName = routeName
    .split('/')
    .filter((segment) => segment && !(segment.startsWith('(') && segment.endsWith(')')))
    .at(-1);

  if (!normalizedRouteName) return -1;

  return items.findIndex((item) =>
    item.key === normalizedRouteName ||
    item.href.replace(/^\/+|\/+$/g, '') === normalizedRouteName
  );
}

export function getPagerSceneTranslateXFromPosition(
  sceneIndex: number,
  pagerPosition: number,
  viewportWidth: number,
): number {
  if (
    !Number.isInteger(sceneIndex) ||
    !Number.isFinite(pagerPosition) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0
  ) {
    return 0;
  }

  const translateX = (sceneIndex - pagerPosition) * viewportWidth;
  return Number.isFinite(translateX) ? translateX : 0;
}
