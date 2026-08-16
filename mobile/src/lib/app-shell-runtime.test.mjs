import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  resolveHomeRestaurantIdentity,
  runManualRefresh,
  shouldShowTabletWorkspaceRail,
} from './app-shell-runtime.ts';
import { palette } from './theme-palette.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function tsxFilesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(target);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [target] : [];
  }));
  return files.flat();
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test('mobile surfaces and primary navigation use an accessible orange-forward palette', () => {
  assert.deepEqual({
    canvas: palette.canvas,
    surface: palette.surface,
    surfaceSubtle: palette.surfaceSubtle,
    surfaceStrong: palette.surfaceStrong,
    border: palette.border,
    controlBorder: palette.controlBorder,
    primary: palette.primary,
    accent: palette.accent,
    navigationSurface: palette.navigationSurface,
    navigationActive: palette.navigationActive,
  }, {
    canvas: '#FFF7ED',
    surface: '#FFFCF8',
    surfaceSubtle: '#FFF4E8',
    surfaceStrong: '#FFEDD5',
    border: '#FED7AA',
    controlBorder: '#C77948',
    primary: '#C2410C',
    accent: '#C2410C',
    navigationSurface: '#9A3412',
    navigationActive: '#FFEDD5',
  });

  assert.ok(contrastRatio(palette.primaryText, palette.primary) >= 4.5);
  assert.ok(contrastRatio(palette.text, palette.canvas) >= 4.5);
  assert.ok(contrastRatio(palette.muted, palette.surfaceStrong) >= 4.5);
  assert.ok(contrastRatio(palette.placeholder, palette.surfaceSubtle) >= 4.5);
  assert.ok(contrastRatio(palette.controlBorder, palette.surfaceSubtle) >= 3);
  assert.ok(contrastRatio(palette.navigationActiveText, palette.navigationActive) >= 4.5);
  assert.ok(contrastRatio(palette.navigationMuted, palette.navigationSurface) >= 3);

  assert.deepEqual({
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    info: palette.info,
    neutral: palette.neutral,
  }, {
    success: '#047857',
    warning: '#B45309',
    danger: '#B91C1C',
    info: '#0369A1',
    neutral: '#475569',
  });
});

test('mobile chrome does not retain dark neutral background islands', async () => {
  const [appShellSource, authScreenSource, orderDetailSource, cropperSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'src', 'components', 'auth-screen.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', 'order', '[id].tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'src', 'components', 'menu-image-cropper.tsx'), 'utf8'),
  ]);

  const retiredDarkNeutrals = /#(?:17191D|292C31|34383F|3A3E45|AEB6C2|0F172A|2F333A|3A3E46|464B54|202329|444851|000000)|rgba\(17\s*,\s*19\s*,\s*24/i;

  assert.doesNotMatch(appShellSource, retiredDarkNeutrals);
  assert.doesNotMatch(authScreenSource, retiredDarkNeutrals);
  assert.doesNotMatch(orderDetailSource, retiredDarkNeutrals);
  assert.doesNotMatch(cropperSource, retiredDarkNeutrals);
  assert.match(appShellSource, /backgroundColor:\s*palette\.navigationSurface/);
  assert.match(appShellSource, /backgroundColor:\s*palette\.navigationActive/);
  assert.match(cropperSource, /aspectBadge:[\s\S]{0,260}backgroundColor:\s*palette\.navigationBorder/);
});

test('mobile form controls use orange boundaries at rest and focus', async () => {
  const [uiSource, themeSource, assistantSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'src', 'components', 'ui.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'src', 'theme.ts'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', 'ai-assistant.tsx'), 'utf8'),
  ]);

  assert.doesNotMatch(uiSource, /focused\s*\?\s*palette\.textStrong\s*:\s*palette\.border/);
  assert.match(uiSource, /focused\s*\?\s*palette\.primary\s*:\s*palette\.controlBorder/);
  assert.match(themeSource, /input:[\s\S]{0,180}borderColor:\s*palette\.controlBorder/);
  assert.match(assistantSource, /borderColor:\s*palette\.controlBorder/);
});

test('staff warnings are announced and only describe a real custom-access reset', async () => {
  const [uiSource, memberSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'src', 'components', 'ui.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', 'staff', 'member.tsx'), 'utf8'),
  ]);

  assert.match(
    uiSource,
    /accessibilityLiveRegion=\{tone === 'danger' \? 'assertive' : tone === 'neutral' \? 'none' : 'polite'\}/,
  );
  assert.match(
    memberSource,
    /roleId !== member\.role_id\s*&& member\.permissions_override != null/,
  );
});

test('role editor animates local state changes without stacked boxes or extra rules', async () => {
  const [roleSource, motionSource, uiSource, shellSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'app', 'staff', 'role.tsx'), 'utf8')
      .then((source) => source.replace(/\r\n/g, '\n')),
    readFile(path.join(mobileRoot, 'src', 'components', 'motion.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'src', 'components', 'ui.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'), 'utf8'),
  ]);

  assert.match(roleSource, /<AnimatedCollapse expanded=\{expanded\}>/);
  assert.match(roleSource, /<AnimatedDisclosureIcon expanded=\{expanded\}/);
  assert.doesNotMatch(roleSource, /\{expanded \? group\.rows\.map/);
  assert.match(motionSource, /export function AnimatedCollapse/);
  assert.match(motionSource, /height\.stopAnimation\(\)/);
  assert.match(motionSource, /accessibilityElementsHidden=\{!expanded\}/);
  assert.match(motionSource, /export function MotionCrossfade/);
  assert.match(motionSource, /const reduced = useReducedMotion\(\)/);

  assert.doesNotMatch(roleSource, /\{confirmDelete \? \(\s*<Feedback/);
  const deleteBlockStart = roleSource.indexOf('const deleteActions =');
  const deleteBlockEnd = roleSource.indexOf('\n\n  return (', deleteBlockStart);
  assert.ok(deleteBlockStart >= 0 && deleteBlockEnd > deleteBlockStart);
  const deleteBlock = roleSource.slice(deleteBlockStart, deleteBlockEnd);
  assert.match(deleteBlock, /<MotionCrossfade/);
  assert.doesNotMatch(deleteBlock, /<Surface|<Feedback/);
  assert.match(deleteBlock, /deleteError \|\|/);

  assert.match(roleSource, /if \(editing && loading\) \{/);
  assert.match(roleSource, /<ActivityIndicator/);
  assert.match(roleSource, /setDeleteError\(err instanceof Error/);

  assert.match(
    roleSource,
    /borderTopWidth: tabletWorkspace \? 0 : groupIndex \? 1 : 0/,
  );
  assert.doesNotMatch(roleSource, /borderTopWidth: 1,/);
  assert.match(motionSource, /height: containerHeight/);
  assert.match(motionSource, /onLayout=\{\(event\) => \{/);
  assert.match(uiSource, /showTopBorder = true/);
  assert.match(uiSource, /borderTopWidth: showTopBorder \? 1 : 0/);
  assert.match(roleSource, /<ActionDock showTopBorder=\{false\}>/);

  assert.match(shellSource, /titleContent\?: React\.ReactNode/);
  assert.match(shellSource, /titleContent \?\? \(/);
  assert.match(roleSource, /titleContent=\{roleTitleContent\}/);
  const roleTitleStart = roleSource.indexOf('const roleTitleContent =');
  const roleTitleEnd = roleSource.indexOf('const roleNameAction =', roleTitleStart);
  assert.ok(roleTitleStart >= 0 && roleTitleEnd > roleTitleStart);
  const roleTitleBlock = roleSource.slice(roleTitleStart, roleTitleEnd);
  assert.match(roleTitleBlock, /<TextInput/);
  assert.match(roleTitleBlock, /typeScale\.hero/);
  assert.match(roleTitleBlock, /minHeight: 44/);
  assert.match(roleTitleBlock, /numberOfLines=\{1\}/);
  assert.match(roleSource, /accessibilityLabel=\{copy\('ชื่อบทบาท', 'Role name'\)\}/);
  assert.match(roleSource, /width: 44,[\s\S]{0,120}height: 44/);
  assert.match(roleSource, /name=\{editingName \? 'checkmark' : 'create-outline'\}/);
  assert.doesNotMatch(roleSource, /!role\?\.is_system/);
  assert.doesNotMatch(roleSource, /<Surface>\s*<TextField[\s\S]{0,180}ชื่อบทบาท/);
  assert.match(roleSource, /function finishNameEditing\(\): boolean/);
  assert.match(roleSource, /if \(!canFinishRoleNameEdit\(name\)\)/);
  assert.match(roleSource, /setEditingName\(true\)[\s\S]{0,160}nameInputRef\.current\?\.focus\(\)/);
  assert.match(roleSource, /onSubmitEditing=\{finishNameEditing\}/);
  assert.match(roleSource, /submitBehavior="submit"/);
  assert.match(roleSource, /let nameSaved = false/);
  assert.match(roleSource, /nameSaved = true/);
  assert.match(roleSource, /roleSaveFailureMessage\(\s*nameSaved,/);
  assert.match(roleSource, /roleId === activeMembership\?\.role_id/);
  assert.match(roleSource, /await refreshMemberships\(\)\.catch\(\(\) => undefined\)/);
});

test('manual refresh owns the native refreshing lifecycle on success and failure', async () => {
  const successfulStates = [];
  await runManualRefresh(async () => {}, (refreshing) => successfulStates.push(refreshing));
  assert.deepEqual(successfulStates, [true, false]);

  const failedStates = [];
  await assert.rejects(
    runManualRefresh(async () => {
      throw new Error('offline');
    }, (refreshing) => failedStates.push(refreshing)),
    /offline/,
  );
  assert.deepEqual(failedStates, [true, false]);
});

test('home restaurant identity uses stable name, branch, role, and user fallbacks', () => {
  assert.deepEqual(resolveHomeRestaurantIdentity({
    restaurantName: 'ครัวบ้าน',
    branchName: 'สาขาหลัก',
    roleDisplayName: 'เจ้าของร้าน',
    nickname: 'Beam',
  }), {
    restaurantName: 'ครัวบ้าน',
    detail: 'สาขาหลัก',
    userInitial: 'B',
  });

  assert.deepEqual(resolveHomeRestaurantIdentity({
    roleName: 'manager',
    email: 'owner@example.test',
  }), {
    restaurantName: 'Dishy',
    detail: 'manager',
    userInitial: 'O',
  });

  assert.deepEqual(resolveHomeRestaurantIdentity({
    restaurantName: 'ครัวบ้าน',
    roleDisplayNameOverride: 'หัวหน้าร้าน',
    roleDisplayName: 'Manager',
    roleName: 'manager',
    nickname: 'โม',
  }), {
    restaurantName: 'ครัวบ้าน',
    detail: 'หัวหน้าร้าน',
    userInitial: 'โ',
  });
});

test('mobile role-name surfaces consume the restaurant override contract', async () => {
  const [typesSource, restaurantsSource, invitationSource, homeSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'src', 'types', 'restaurant.ts'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', 'restaurants.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', 'invite', '[token].tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', '(primary)', 'home.tsx'), 'utf8'),
  ]);

  assert.match(typesSource, /display_name_override\?: string/);
  assert.match(restaurantsSource, /roleLabel\(membership\.role, language\)/);
  assert.match(invitationSource, /return roleLabel\(role, language\)/);
  assert.match(homeSource, /roleDisplayNameOverride: activeMembership\?\.role\?\.display_name_override/);
});

test('restaurant identity is rendered only on Home while detail headings retain Back', async () => {
  const appShellSource = await readFile(
    path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'),
    'utf8',
  );
  const appFiles = await tsxFilesUnder(path.join(mobileRoot, 'app'));
  const identityConsumers = [];

  for (const file of appFiles) {
    const source = await readFile(file, 'utf8');
    if (source.includes('<HomeRestaurantIdentity')) {
      identityConsumers.push(path.relative(mobileRoot, file).replaceAll('\\', '/'));
    }
  }

  assert.doesNotMatch(appShellSource, /function RestaurantBar\b|<RestaurantBar\b/);
  assert.match(appShellSource, /showBack=\{!topLevel\}/);
  assert.match(appShellSource, /router\.back\(\)/);
  assert.deepEqual(identityConsumers, ['app/(primary)/home.tsx']);
});

test('the primary tab navigator is the sole owner of the phone bottom dock', async () => {
  const [appShellSource, primaryLayoutSource] = await Promise.all([
    readFile(
      path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'),
      'utf8',
    ),
    readFile(path.join(mobileRoot, 'app', '(primary)', '_layout.tsx'), 'utf8'),
  ]);

  assert.equal(
    (appShellSource.match(/<PrimaryPhoneNavigation\b/g) || []).length,
    0,
    'standalone AppScreen routes must never render the primary phone dock',
  );
  assert.equal(
    (primaryLayoutSource.match(/<PrimaryPhoneNavigation\b/g) || []).length,
    1,
    'the primary tab layout must keep exactly one phone dock',
  );
  assert.doesNotMatch(
    appShellSource,
    /tabSwipeResponder\.panHandlers/,
    'standalone AppScreen routes must leave horizontal navigation gestures to the native stack',
  );
  assert.match(
    primaryLayoutSource,
    /onSelect=\{jumpToTab\}/,
    'bottom dock presses must use the direct, non-animated tab path',
  );
  const jumpStart = primaryLayoutSource.indexOf('const jumpToTab = useCallback');
  const gestureStart = primaryLayoutSource.indexOf('const finishGesture = useCallback');
  assert.ok(jumpStart >= 0 && gestureStart > jumpStart);
  const jumpSource = primaryLayoutSource.slice(jumpStart, gestureStart);
  assert.match(jumpSource, /writePagerPosition\(plan\.position\)/);
  assert.doesNotMatch(
    jumpSource,
    /animatePagerTo|Animated\.timing/,
    'direct dock selection must never enter a pager timing animation',
  );
  assert.doesNotMatch(
    primaryLayoutSource,
    /isTablet\s*\|\|\s*transitionActiveRef\.current\s*\|\|/,
    'the 500ms visual settle must not block the next swipe',
  );
  assert.doesNotMatch(
    primaryLayoutSource,
    /isTablet\s*\|\|\s*pendingRouteIndexRef\.current !== null\s*\|\|/,
    'route acknowledgement must not block the next swipe either',
  );
  assert.match(
    primaryLayoutSource,
    /resolvePagerGestureStartPlan\(/,
    'a consecutive swipe must start from the latest pending tab target',
  );
  assert.match(
    primaryLayoutSource,
    /if \(!settlement\.completed\) \{\s*restoreCommittedPager\(transitionId\);\s*return;/,
    'an owned native cancellation must clear pending route state before late reconciliation',
  );
  assert.match(
    primaryLayoutSource,
    /routeSyncTimer\.current = setTimeout\(\(\) => \{\s*if \(pagerGestureActiveRef\.current\) return;\s*restoreCommittedPager\(transitionId\);/,
    'the route watchdog must not reset the pager while a deliberate drag is still held',
  );
});

test('the tablet rail stays outside native stack screen transitions', async () => {
  const [rootLayoutSource, appShellSource, primaryLayoutSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'app', '_layout.tsx'), 'utf8'),
    readFile(
      path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'),
      'utf8',
    ),
    readFile(path.join(mobileRoot, 'app', '(primary)', '_layout.tsx'), 'utf8'),
  ]);

  const stackLayoutStart = rootLayoutSource.indexOf('function TabletWorkspaceStackLayout(');
  const stackLayoutEnd = rootLayoutSource.indexOf('function AppNavigator(', stackLayoutStart);
  assert.ok(
    stackLayoutStart >= 0 && stackLayoutEnd > stackLayoutStart,
    'the native Stack must have a stable tablet workspace layout',
  );
  const stackLayoutSource = rootLayoutSource.slice(stackLayoutStart, stackLayoutEnd);
  assert.match(stackLayoutSource, /<TabletWorkspaceFrame>/);
  assert.match(stackLayoutSource, /\{children\}/);
  assert.match(stackLayoutSource, /<\/TabletWorkspaceFrame>/);

  const rootStackStart = rootLayoutSource.indexOf('<Stack');
  const rootStackEnd = rootLayoutSource.indexOf('</Stack>', rootStackStart);
  assert.ok(rootStackStart >= 0 && rootStackEnd > rootStackStart, 'root Stack must exist');
  const rootStackSource = rootLayoutSource.slice(rootStackStart, rootStackEnd);
  assert.match(
    rootStackSource,
    /\blayout=\{TabletWorkspaceStackLayout\}/,
    'the tablet workspace frame must wrap navigator children, not individual screens',
  );
  assert.match(
    rootStackSource,
    /screenOptions=\{\{[\s\S]*?animation:\s*'slide_from_right'/,
    'pushed workflow content must retain the native slide transition',
  );

  const frameStart = appShellSource.indexOf('export function TabletWorkspaceFrame(');
  const frameEnd = appShellSource.indexOf('const PHONE_DOCK_HEIGHT', frameStart);
  assert.ok(frameStart >= 0 && frameEnd > frameStart, 'TabletWorkspaceFrame must exist');
  const frameSource = appShellSource.slice(frameStart, frameEnd);
  assert.equal(
    (frameSource.match(/<PrimaryTabletRail\b/g) || []).length,
    1,
    'the persistent tablet frame must render exactly one rail',
  );
  assert.match(frameSource, /shouldShowTabletWorkspaceRail\(/);
  assert.match(frameSource, /tabletBreakpoint:\s*breakpoints\.tablet/);
  assert.match(
    frameSource,
    /\{showRail\s*\?\s*\(\s*<PrimaryTabletRail\b/,
    'the shared visibility decision must gate the rendered tablet rail',
  );
  assert.match(frameSource, /const isOnPrimaryRoot = primaryNavigation\.some\(/);
  assert.match(frameSource, /router\.navigate\(item\.href as never\)/);
  assert.match(
    frameSource,
    /onSelectPrimary=\{isOnPrimaryRoot \? navigateToPrimaryRoot : undefined\}/,
    'primary rail presses must dispatch tab-compatible navigation while inside the tab host',
  );

  const appScreenStart = appShellSource.indexOf('export function AppScreen(');
  assert.ok(appScreenStart >= 0, 'AppScreen must exist');
  assert.doesNotMatch(
    appShellSource.slice(appScreenStart),
    /<PrimaryTabletRail\b/,
    'individual stack screens must not recreate the tablet rail',
  );
  assert.doesNotMatch(
    primaryLayoutSource,
    /<PrimaryTabletRail\b/,
    'the primary tab host must use the same persistent tablet rail',
  );
});

test('the persistent tablet rail is limited to authenticated workspace routes', () => {
  const baseInput = {
    activeMembership: true,
    authStatus: 'ready',
    tabletBreakpoint: 768,
    user: true,
    width: 1024,
  };

  for (const pathname of ['/home', '/order/new', '/menu/item', '/settings/display']) {
    assert.equal(
      shouldShowTabletWorkspaceRail({ ...baseInput, pathname }),
      true,
      `${pathname} must retain the persistent tablet rail`,
    );
  }

  for (const pathname of ['/', '/login', '/register', '/restaurants', '/invite/manual']) {
    assert.equal(
      shouldShowTabletWorkspaceRail({ ...baseInput, pathname }),
      false,
      `${pathname} must remain outside the workspace shell`,
    );
  }

  assert.equal(
    shouldShowTabletWorkspaceRail({ ...baseInput, pathname: '/home', width: 767 }),
    false,
  );
  assert.equal(
    shouldShowTabletWorkspaceRail({ ...baseInput, pathname: '/home', width: 768 }),
    true,
  );
  assert.equal(
    shouldShowTabletWorkspaceRail({ ...baseInput, authStatus: 'loading', pathname: '/home' }),
    false,
  );
  assert.equal(
    shouldShowTabletWorkspaceRail({ ...baseInput, activeMembership: false, pathname: '/home' }),
    false,
  );
});

test('every destination opened from More is a detail screen without primary chrome', async () => {
  const moreDestinationFiles = [
    'menu.tsx',
    'inventory.tsx',
    'table-management.tsx',
    'reservations.tsx',
    'staff.tsx',
    'reports.tsx',
    'ai-assistant.tsx',
    'settings.tsx',
  ];

  for (const relativeFile of moreDestinationFiles) {
    const source = await readFile(path.join(mobileRoot, 'app', relativeFile), 'utf8');
    const screenCount = (source.match(/<AppScreen\b/g) || []).length;
    const detailScreenCount = (source.match(/\btopLevel=\{false\}/g) || []).length;

    assert.ok(screenCount > 0, `${relativeFile} must render AppScreen`);
    assert.equal(
      detailScreenCount,
      screenCount,
      `${relativeFile} must keep every loading, error, and content branch out of the primary tab zone`,
    );
  }
});

test('primary tab-zone screens stay top-level and do not add a back control', async () => {
  const primaryScreenFiles = [
    'home.tsx',
    'tables.tsx',
    'kitchen.tsx',
    'orders.tsx',
    'more.tsx',
  ];

  for (const relativeFile of primaryScreenFiles) {
    const source = await readFile(
      path.join(mobileRoot, 'app', '(primary)', relativeFile),
      'utf8',
    );
    const screenCount = (source.match(/<AppScreen\b/g) || []).length;
    const topLevelScreenCount = (
      source.match(/\btopLevel(?=\s|>)/g) || []
    ).length + (source.match(/\btopLevel=\{true\}/g) || []).length;

    assert.ok(screenCount > 0, `${relativeFile} must render AppScreen`);
    assert.equal(
      topLevelScreenCount,
      screenCount,
      `${relativeFile} belongs to the bottom-dock zone and must not show Back`,
    );
  }
});

test('native stack keeps edge-swipe Back on pushed screens but disables it for the tab host', async () => {
  const rootLayoutSource = await readFile(
    path.join(mobileRoot, 'app', '_layout.tsx'),
    'utf8',
  );

  assert.match(rootLayoutSource, /screenOptions=\{\{[\s\S]{0,280}gestureEnabled:\s*true/);
  assert.match(
    rootLayoutSource,
    /const topLevelScreenOptions\s*=\s*\{[\s\S]{0,160}gestureEnabled:\s*false/,
  );
  assert.doesNotMatch(rootLayoutSource, /fullScreenGestureEnabled/);
});

test('detail heading Back is a bare chevron with an accessible 44 point target', async () => {
  const appShellSource = await readFile(
    path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'),
    'utf8',
  );
  const headingStart = appShellSource.indexOf('function ScreenHeading(');
  const headingEnd = appShellSource.indexOf('export function AppScreen(', headingStart);

  assert.ok(headingStart >= 0 && headingEnd > headingStart, 'ScreenHeading must exist');
  const headingSource = appShellSource.slice(headingStart, headingEnd);

  assert.match(headingSource, /accessibilityLabel=\{copy\('ย้อนกลับ', 'Go back'\)\}/);
  assert.match(headingSource, /accessibilityRole="button"/);
  assert.match(headingSource, /width:\s*44/);
  assert.match(headingSource, /height:\s*44/);
  assert.match(headingSource, /name="chevron-back-outline"/);
  assert.doesNotMatch(headingSource, /name="arrow-back"/);
  assert.doesNotMatch(
    headingSource,
    /backgroundColor|borderRadius/,
    'Back must not have a filled or rounded background treatment',
  );
});

test('auth flow Back uses the same bare chevron treatment', async () => {
  const authScreenSource = await readFile(
    path.join(mobileRoot, 'src', 'components', 'auth-screen.tsx'),
    'utf8',
  );
  const backStart = authScreenSource.indexOf('function BackButton()');
  const backEnd = authScreenSource.indexOf('function AuthArtwork()', backStart);

  assert.ok(backStart >= 0 && backEnd > backStart, 'Auth BackButton must exist');
  const backSource = authScreenSource.slice(backStart, backEnd);

  assert.match(backSource, /accessibilityLabel=\{copy\('ย้อนกลับ', 'Go back'\)\}/);
  assert.match(backSource, /accessibilityRole="button"/);
  assert.match(backSource, /width:\s*44/);
  assert.match(backSource, /height:\s*44/);
  assert.match(backSource, /name="chevron-back-outline"/);
  assert.doesNotMatch(backSource, /name="arrow-back"/);
  assert.doesNotMatch(backSource, /backgroundColor|borderRadius/);
});

test('app routes use the manual refresh control instead of binding native refresh to loading', async () => {
  const appShellSource = await readFile(
    path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'),
    'utf8',
  );
  const appFiles = await tsxFilesUnder(path.join(mobileRoot, 'app'));
  const directNativeConsumers = [];

  for (const file of appFiles) {
    const source = await readFile(file, 'utf8');
    if (/\bRefreshControl\b/.test(source)) {
      directNativeConsumers.push(path.relative(mobileRoot, file).replaceAll('\\', '/'));
    }
  }

  assert.deepEqual(directNativeConsumers, []);
  assert.match(appShellSource, /export function AppRefreshControl\b/);
  assert.match(appShellSource, /refreshing=\{refreshing\}/);
  assert.doesNotMatch(appShellSource, /refreshing=\{loading\}/);
});

test('warm primary scenes clear busy state when focus cleanup invalidates a foreground load', async () => {
  const [homeSource, tablesSource, ordersSource] = await Promise.all([
    readFile(path.join(mobileRoot, 'app', '(primary)', 'home.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', '(primary)', 'tables.tsx'), 'utf8'),
    readFile(path.join(mobileRoot, 'app', '(primary)', 'orders.tsx'), 'utf8'),
  ]);

  assert.match(
    homeSource,
    /requestIdRef\.current \+= 1;\s+foregroundRequestIdRef\.current = null;\s+setLoading\(false\);/,
  );
  assert.match(
    tablesSource,
    /requestGenerationRef\.current\.invalidate\(\);\s+foregroundRequestRef\.current = null;\s+setLoading\(false\);/,
  );
  assert.match(
    ordersSource,
    /requestIdRef\.current \+= 1;\s+setLoading\(false\);\s+setLoadingMore\(false\);/,
  );
});
