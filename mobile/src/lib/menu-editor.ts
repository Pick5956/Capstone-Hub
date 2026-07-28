import type {
  Category,
  MenuItem,
  MenuItemCategory,
} from '@/src/types/menu';

type CategoryChoice = Pick<Category, 'ID' | 'display_order' | 'is_active' | 'name'>;
type MenuCategorySource = Pick<MenuItem, 'category_id'> & {
  categories?: Array<Pick<MenuItemCategory, 'category_id'>>;
};

export function initialMenuCategoryIds(
  item: MenuCategorySource | undefined,
  categories: CategoryChoice[],
): number[] {
  if (!item) {
    const firstActive = [...categories]
      .filter((category) => category.is_active)
      .sort(
        (left, right) =>
          left.display_order - right.display_order || left.ID - right.ID,
      )[0];
    return firstActive ? [firstActive.ID] : [];
  }

  const linked = item.categories
    ?.map((category) => category.category_id)
    .filter((categoryId) => categoryId > 0);
  const candidates = linked?.length ? linked : [item.category_id];
  return [...new Set(candidates.filter((categoryId) => categoryId > 0))];
}

export function selectableMenuCategories<T extends CategoryChoice>(
  categories: T[],
  selectedCategoryIds: number[],
): T[] {
  const selected = new Set(selectedCategoryIds);
  return [...categories]
    .filter((category) => category.is_active || selected.has(category.ID))
    .sort(
      (left, right) =>
        left.display_order - right.display_order || left.ID - right.ID,
    );
}
