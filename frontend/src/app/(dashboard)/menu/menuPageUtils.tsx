import type { Ingredient } from "@/src/types/ingredient";
import type { MenuIngredientInput, MenuItem, MenuItemInput, MenuOptionGroupInput } from "@/src/types/menu";

export const emptyItem: MenuItemInput = {
  category_id: 0,
  category_ids: [],
  name: "",
  price: 0,
  image_url: "",
  description: "",
  is_available: true,
  display_order: 0,
  option_groups: [],
  ingredients: [],
};

export const emptyOptionGroup = (): MenuOptionGroupInput => ({
  name: "",
  required: false,
  min_select: 0,
  max_select: 1,
  display_order: 0,
  is_active: true,
  options: [{ name: "", price_delta: 0, is_default: false, display_order: 0, is_active: true }],
});

export const emptyRecipeComponent = (): MenuIngredientInput => ({
  ingredient_id: 0,
  quantity: 0,
  unit: "",
  note: "",
});

export function recipeCost(components: MenuIngredientInput[], ingredients: Ingredient[]) {
  return components.reduce((total, component) => {
    const ingredient = ingredients.find((item) => item.ID === component.ingredient_id);
    if (!ingredient || component.quantity <= 0) return total;
    const yieldPercent = ingredient.yield_percent && ingredient.yield_percent > 0 ? ingredient.yield_percent : 100;
    return total + (component.quantity * ingredient.cost_per_unit) / (yieldPercent / 100);
  }, 0);
}

export function menuCategoryIds(item: MenuItem) {
  const linkedIds = new Set<number>();
  for (const link of item.categories ?? []) {
    if (link.category_id) linkedIds.add(link.category_id);
  }
  if (linkedIds.size) return Array.from(linkedIds);
  return item.category_id ? [item.category_id] : [];
}

export function menuItemToInput(item: MenuItem, isAvailable = item.is_available): MenuItemInput {
  const categoryIds = menuCategoryIds(item);
  return {
    category_id: categoryIds[0] ?? item.category_id,
    category_ids: categoryIds,
    name: item.name,
    price: item.price,
    image_url: item.image_url,
    description: item.description,
    is_available: isAvailable,
    display_order: item.display_order,
    option_groups: (item.option_groups ?? []).map((group) => ({
      name: group.name,
      required: group.required,
      min_select: group.min_select,
      max_select: group.max_select,
      display_order: group.display_order,
      is_active: group.is_active,
      options: (group.options ?? []).map((option) => ({
        name: option.name,
        price_delta: option.price_delta,
        is_default: option.is_default,
        display_order: option.display_order,
        is_active: option.is_active,
      })),
    })),
    ingredients: (item.ingredients ?? []).map((component) => ({
      ingredient_id: component.ingredient_id,
      quantity: component.quantity,
      unit: component.unit || component.ingredient?.unit || "",
      note: component.note || "",
    })),
  };
}

export function AvailabilitySwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-pressed={checked}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-6 w-11 items-center rounded-full border p-0.5 transition-[background-color,border-color,opacity] disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400"
          : "border-gray-400 bg-gray-300 dark:border-gray-600 dark:bg-gray-700"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full border bg-white shadow-sm transition-transform dark:bg-gray-950 ${
          checked
            ? "translate-x-[19px] border-white dark:border-white"
            : "translate-x-0 border-gray-100 shadow-gray-950/20 dark:border-gray-200"
        }`}
      />
    </button>
  );
}
