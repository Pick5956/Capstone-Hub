import type { MenuItem, MenuOptionGroup } from "@/src/types/menu";

export function menuCategoryIds(item: MenuItem) {
  const ids = new Set<number>();
  if (item.category_id) ids.add(item.category_id);
  for (const link of item.categories ?? []) {
    if (link.category_id) ids.add(link.category_id);
  }
  return Array.from(ids);
}

export function menuOptionLimits(group: MenuOptionGroup) {
  const minSelect = group.required ? Math.max(1, group.min_select || 0) : Math.max(0, group.min_select || 0);
  const maxSelect = Math.max(minSelect || 1, group.max_select || 1);
  return { minSelect, maxSelect };
}
