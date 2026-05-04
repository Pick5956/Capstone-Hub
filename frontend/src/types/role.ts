export interface Role {
  ID: number;
  name: string;
  permissions: string; // JSON array of permission keys, e.g. '["view_dashboard","take_order"]'
}
