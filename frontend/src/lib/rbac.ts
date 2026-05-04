import { Permission } from "../types/auth";
import { Membership } from "../types/restaurant";

const fallbackRolePermissions: Record<string, Permission[]> = {
  owner: ["*"],
  manager: ["view_dashboard", "manage_menu", "manage_table", "manage_staff", "manage_inventory", "view_reports"],
  cashier: ["view_dashboard", "take_payment", "view_orders", "view_tables"],
  waiter: ["view_dashboard", "take_order", "manage_table", "view_menu", "view_orders"],
  chef: ["view_kitchen", "update_order_status", "view_menu", "view_inventory"],
};

export function can(membership: Membership | null | undefined, permission: Permission): boolean {
  const rawPermissions = membership?.role?.permissions;
  if (rawPermissions) {
    try {
      const permissions = JSON.parse(rawPermissions) as Permission[];
      return permissions.includes("*") || permissions.includes(permission);
    } catch {
      // Fall through to role-name defaults.
    }
  }

  const roleName = membership?.role?.name ?? "";
  const permissions = fallbackRolePermissions[roleName] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}
