export interface Category {
  ID: number;
  restaurant_id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface MenuItem {
  ID: number;
  restaurant_id: number;
  category_id: number;
  name: string;
  price: number;
  image_url: string;
  description: string;
  is_available: boolean;
  display_order: number;
  category?: Category;
  option_groups?: MenuOptionGroup[];
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface MenuOptionGroup {
  ID: number;
  restaurant_id: number;
  menu_item_id: number;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  display_order: number;
  is_active: boolean;
  options?: MenuOption[];
}

export interface MenuOption {
  ID: number;
  restaurant_id: number;
  menu_item_id: number;
  option_group_id: number;
  name: string;
  price_delta: number;
  is_default: boolean;
  display_order: number;
  is_active: boolean;
}

export interface CategoryInput {
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface MenuItemInput {
  category_id: number;
  name: string;
  price: number;
  image_url?: string;
  description?: string;
  is_available: boolean;
  display_order: number;
  option_groups?: MenuOptionGroupInput[];
}

export interface MenuOptionGroupInput {
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  display_order: number;
  is_active: boolean;
  options: MenuOptionInput[];
}

export interface MenuOptionInput {
  name: string;
  price_delta: number;
  is_default: boolean;
  display_order: number;
  is_active: boolean;
}
