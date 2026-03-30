import { Permission, User } from "../types/auth";

const rolePermissions: Record<string, Permission[]> = {
  admin:   ["view_dashboard", "manage_users", "edit_post"],
  teacher: ["edit_post", "view_dashboard"],
  student: ["view_dashboard"],
};

export function can(user: User, permission: Permission): boolean {
  return rolePermissions[user.role?.role ?? ""]?.includes(permission) ?? false;
}
