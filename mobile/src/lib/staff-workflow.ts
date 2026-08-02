import type {
  InvitationRoleSummary,
  Membership,
  RestaurantAuditLog,
  Role,
} from '@/src/types/restaurant';
import type { DisplayLanguage } from '@/src/lib/display-preferences';

const ROLE_LABELS: Record<string, Record<DisplayLanguage, string>> = {
  owner: { th: 'เจ้าของร้าน', en: 'Owner' },
  manager: { th: 'ผู้จัดการ', en: 'Manager' },
  cashier: { th: 'แคชเชียร์', en: 'Cashier' },
  waiter: { th: 'พนักงานเสิร์ฟ', en: 'Waiter' },
  chef: { th: 'ครัว', en: 'Kitchen' },
};

const STATUS_LABELS: Record<string, Record<DisplayLanguage, string>> = {
  active: { th: 'ใช้งาน', en: 'Active' },
  suspended: { th: 'ระงับ', en: 'Suspended' },
  removed: { th: 'นำออกแล้ว', en: 'Removed' },
  pending: { th: 'รอรับคำเชิญ', en: 'Invitation pending' },
};

export const DEFAULT_INVITATION_EXPIRY_DAYS = 7;
export const INVITATION_EXPIRY_DAY_OPTIONS = [1, 3, 7, 14, 30, 0] as const;

export function invitationExpiryLabel(
  days: number,
  language: DisplayLanguage = 'th',
): string {
  if (days === 0) return language === 'th' ? 'ไม่หมดอายุ' : 'Never expires';
  return language === 'th' ? `${days} วัน` : `${days} ${days === 1 ? 'day' : 'days'}`;
}

function permissionList(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : null;
  } catch {
    return null;
  }
}

function hasManageStaffPermission(membership: Membership): boolean {
  if (membership.permissions_override != null) {
    const override = permissionList(membership.permissions_override);
    return Boolean(override?.includes('*') || override?.includes('manage_staff'));
  }

  const rolePermissions = permissionList(membership.role?.permissions);
  return Boolean(
    rolePermissions?.includes('*') || rolePermissions?.includes('manage_staff'),
  );
}

export function canManageTeam(membership: Membership | null | undefined): boolean {
  if (!membership || membership.status !== 'active') return false;
  const roleName = membership.role?.name;
  return (roleName === 'owner' || roleName === 'manager') && hasManageStaffPermission(membership);
}

export function canManageTarget(
  actorRole?: string,
  targetRole?: string,
  isSelf = false,
): boolean {
  if (isSelf || !actorRole || !targetRole) return false;
  if (actorRole === 'owner') return targetRole !== 'owner';
  if (actorRole === 'manager') return targetRole !== 'owner' && targetRole !== 'manager';
  return false;
}

export function allowedRoleOptions(actorRole: string | undefined, roles: Role[]): Role[] {
  if (actorRole !== 'owner' && actorRole !== 'manager') return [];
  return roles.filter((role) => {
    if (role.name === 'owner') return false;
    if (actorRole === 'manager' && role.name === 'manager') return false;
    return true;
  });
}

export function invitationTokenFrom(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';

  let candidate = normalized;
  try {
    const parsed = new URL(normalized);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    candidate = pathParts.at(-1) || parsed.hostname;
  } catch {
    const pathParts = normalized.split(/[/?#]/).filter(Boolean);
    candidate = pathParts.at(-1) || '';
  }

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    return '';
  }
  return /^[A-Za-z0-9_-]{32}$/.test(candidate) ? candidate : '';
}

export function invitationEmailMismatch(
  invitationEmail?: string,
  currentUserEmail?: string,
): boolean {
  const invited = invitationEmail?.trim().toLowerCase() ?? '';
  const current = currentUserEmail?.trim().toLowerCase() ?? '';
  if (!invited || !current || invited.includes('*')) return false;
  return invited !== current;
}

export function isInvitationUsableAt(
  invitation: { status: string; expires_at?: string | null },
  now = new Date(),
): boolean {
  if (invitation.status !== 'pending') return false;
  if (!invitation.expires_at) return true;
  const expiresAt = new Date(invitation.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export function roleLabel(
  role: Role | InvitationRoleSummary | string | null | undefined,
  language: DisplayLanguage = 'th',
): string {
  const roleName = typeof role === 'string' ? role : role?.name;
  if (!roleName) return language === 'th' ? 'พนักงาน' : 'Staff';
  const displayName = typeof role === 'string' ? '' : role?.display_name?.trim();
  return ROLE_LABELS[roleName]?.[language] ?? (displayName || roleName);
}

export function staffStatusLabel(
  status: string,
  language: DisplayLanguage = 'th',
): string {
  return STATUS_LABELS[status]?.[language] ?? status;
}

function auditDetails(details: string): Record<string, unknown> {
  try {
    const value = JSON.parse(details) as unknown;
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function auditMessage(
  log: Pick<RestaurantAuditLog, 'action' | 'details'>,
  language: DisplayLanguage = 'th',
): string {
  const details = auditDetails(log.details);
  const roleName = typeof details.role_name === 'string' ? details.role_name : '';
  const email = typeof details.email === 'string' ? details.email : '';
  const fromStatus = typeof details.from_status === 'string' ? details.from_status : '';
  const toStatus = typeof details.to_status === 'string' ? details.to_status : '';
  const fromRole = typeof details.from_role === 'string' ? details.from_role : '';
  const toRole = typeof details.to_role === 'string' ? details.to_role : '';

  if (log.action === 'invitation_created') {
    return language === 'th'
      ? `สร้างคำเชิญ ${roleLabel(roleName, language)}${email ? ` · ${email}` : ''}`
      : `Created invitation for ${roleLabel(roleName, language)}${email ? ` · ${email}` : ''}`;
  }
  if (log.action === 'invitation_revoked') {
    return language === 'th'
      ? `ยกเลิกคำเชิญ${email ? ` · ${email}` : ''}`
      : `Revoked invitation${email ? ` · ${email}` : ''}`;
  }
  if (log.action === 'invitation_accepted') {
    if (language === 'th') {
      return `รับคำเชิญเข้าร่วมร้าน${roleName ? ` เป็น ${roleLabel(roleName, language)}` : ''}`;
    }
    return `Accepted restaurant invitation${roleName ? ` as ${roleLabel(roleName, language)}` : ''}`;
  }
  if (log.action === 'member_status_changed') {
    return language === 'th'
      ? `เปลี่ยนสถานะสมาชิก ${staffStatusLabel(fromStatus, language)} → ${staffStatusLabel(toStatus, language)}`
      : `Changed member status ${staffStatusLabel(fromStatus, language)} → ${staffStatusLabel(toStatus, language)}`;
  }
  if (log.action === 'member_role_changed') {
    return language === 'th'
      ? `เปลี่ยนบทบาท ${roleLabel(fromRole, language)} → ${roleLabel(toRole, language)}`
      : `Changed role ${roleLabel(fromRole, language)} → ${roleLabel(toRole, language)}`;
  }
  if (log.action === 'member_permissions_changed') {
    return language === 'th'
      ? 'ปรับสิทธิ์เฉพาะพนักงาน'
      : 'Changed member-specific permissions';
  }
  return log.action;
}

export function userDisplayName(
  user:
    | Membership['user']
    | RestaurantAuditLog['actor_user']
    | RestaurantAuditLog['target_user']
    | null
    | undefined,
  language: DisplayLanguage = 'th',
): string {
  if (!user) return language === 'th' ? 'ระบบ' : 'System';
  if (user.nickname?.trim()) return user.nickname.trim();
  const fullName = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return fullName || user.email || (language === 'th' ? 'สมาชิก' : 'Member');
}

export function auditAttribution(
  log: Pick<
    RestaurantAuditLog,
    'actor_user_id' | 'target_user_id' | 'actor_user' | 'target_user'
  >,
  language: DisplayLanguage = 'th',
): string {
  const actorName = userDisplayName(log.actor_user, language);
  if (!log.target_user) return actorName;

  const actorId = log.actor_user_id ?? log.actor_user?.ID;
  const targetId = log.target_user_id ?? log.target_user.ID;
  const sameUser = actorId != null && targetId != null && actorId === targetId;
  if (sameUser) return actorName;

  return language === 'th'
    ? `${actorName} · เป้าหมาย ${userDisplayName(log.target_user, language)}`
    : `${actorName} · Target: ${userDisplayName(log.target_user, language)}`;
}
