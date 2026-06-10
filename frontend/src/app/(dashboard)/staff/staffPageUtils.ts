import { can } from "@/src/lib/rbac";
import type { Membership } from "@/src/types/restaurant";
import type { Role } from "@/src/types/role";

export function canManageTeam(membership: Membership | null | undefined) {
  const roleName = membership?.role?.name;
  return (roleName === "owner" || roleName === "manager") && can(membership, "manage_staff");
}

export function canManageTarget(actorRole?: string, targetRole?: string, isSelf = false) {
  if (isSelf || !actorRole || !targetRole) return false;
  if (actorRole === "owner") return targetRole !== "owner";
  if (actorRole === "manager") return targetRole !== "owner" && targetRole !== "manager";
  return false;
}

export function allowedRoleOptions(actorRole?: string, roles: Role[] = []) {
  return roles.filter((role) => {
    if (role.name === "owner") return false;
    if (actorRole === "manager" && role.name === "manager") return false;
    return true;
  });
}

export function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300";
  if (status === "suspended") return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function replaceMember(current: Membership[], nextMember: Membership) {
  return current.map((member) => (member.ID === nextMember.ID ? nextMember : member));
}
