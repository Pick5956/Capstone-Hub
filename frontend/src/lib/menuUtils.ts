import type { MenuItem } from "@/src/types/menu";

export function menuCategoryIds(item: MenuItem) {
  const ids = new Set<number>();
  if (item.category_id) ids.add(item.category_id);
  for (const link of item.categories ?? []) {
    if (link.category_id) ids.add(link.category_id);
  }
  return Array.from(ids);
}
