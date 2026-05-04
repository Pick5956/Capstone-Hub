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
  CreatedAt?: string;
  UpdatedAt?: string;
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
}
