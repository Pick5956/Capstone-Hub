type StackResetRouter<Href> = {
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

const DEFAULT_SWIPE_DISTANCE = 48;
const DEFAULT_SWIPE_VELOCITY = 600;
const DEFAULT_SWIPE_DOMINANCE_RATIO = 1.25;

export function resetRouteStack<Href>(router: StackResetRouter<Href>, href: Href) {
  router.dismissAll();
  router.replace(href);
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
