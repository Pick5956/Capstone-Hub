export interface Role {
  ID: number;
  restaurant_id?: number | null;
  name: string;
  display_name: string;
  permissions: string; // JSON array of permission keys, e.g. '["view_dashboard","take_order"]'
  is_system: boolean;
}
