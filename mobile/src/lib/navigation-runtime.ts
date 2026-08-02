type StackResetRouter<Href> = {
  dismissAll: () => void;
  replace: (href: Href) => void;
};

export function resetRouteStack<Href>(router: StackResetRouter<Href>, href: Href) {
  router.dismissAll();
  router.replace(href);
}

export function shouldOpenSettings(pathname: string) {
  return pathname !== '/settings' && !pathname.startsWith('/settings/');
}
