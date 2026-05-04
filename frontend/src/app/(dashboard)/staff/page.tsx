"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage, type Language } from "@/src/providers/LanguageProvider";
import { getRoles } from "@/src/lib/auth";
import { createInvitation, listPendingInvitations, revokeInvitation } from "@/src/lib/invitation";
import { listAuditLogs, listMembers, updateMemberRole, updateMemberStatus } from "@/src/lib/restaurant";
import type { Invitation, Membership, MembershipStatus, RestaurantAuditLog } from "@/src/types/restaurant";
import type { Role } from "@/src/types/role";
import { RestaurantCardSkeleton, Skeleton } from "@/src/components/shared/Skeleton";
import { createSingleFlight } from "@/src/lib/singleFlight";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

const ROLE_LABELS: Record<Language, Record<string, string>> = {
  th: {
    owner: "เจ้าของร้าน",
    manager: "ผู้จัดการ",
    cashier: "แคชเชียร์",
    waiter: "พนักงานเสิร์ฟ",
    chef: "ครัว",
  },
  en: {
    owner: "Owner",
    manager: "Manager",
    cashier: "Cashier",
    waiter: "Waiter",
    chef: "Chef",
  },
};

const STATUS_LABELS: Record<Language, Record<string, string>> = {
  th: {
    active: "ใช้งาน",
    suspended: "ระงับ",
    removed: "นำออกแล้ว",
    pending: "รอรับคำเชิญ",
  },
  en: {
    active: "Active",
    suspended: "Suspended",
    removed: "Removed",
    pending: "Pending invitation",
  },
};

function roleLabel(role: Role | string | null | undefined, language: Language) {
  const roleName = typeof role === "string" ? role : role?.name;
  if (!roleName) return language === "th" ? "พนักงาน" : "Staff";
  return ROLE_LABELS[language][roleName] ?? roleName;
}

function permissionSummary(role: Role | null | undefined, language: Language) {
  if (!role) return language === "th" ? "พื้นฐาน" : "Basic";
  if (role.permissions === `["*"]`) return language === "th" ? "ทุกเมนู" : "All access";
  try {
    const permissions = JSON.parse(role.permissions) as string[];
    if (!permissions.length) return language === "th" ? "พื้นฐาน" : "Basic";
    return language === "th" ? `${permissions.length} สิทธิ์` : `${permissions.length} permissions`;
  } catch {
    return language === "th" ? "พื้นฐาน" : "Basic";
  }
}

function displayUserName(member: Membership, language: Language) {
  const user = member.user;
  if (!user) return language === "th" ? "สมาชิก" : "Member";
  if (user.nickname?.trim()) return user.nickname.trim();
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}

function formatDate(value: string | null | undefined, language: Language) {
  const fallback = language === "th" ? "ไม่กำหนด" : "No expiry";
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(language === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

function inviteUrl(token: string) {
  if (typeof window === "undefined") return `/invitations/${token}`;
  return `${window.location.origin}/invitations/${token}`;
}

function inviteMailto(invitation: Invitation, language: Language) {
  const restaurantName = invitation.restaurant?.name ?? "Restaurant Hub";
  const subject = language === "th"
    ? `คำเชิญเข้าร่วมร้าน ${restaurantName}`
    : `Invitation to join ${restaurantName}`;
  const body = language === "th"
    ? [
        `สวัสดี${invitation.email ? ` ${invitation.email}` : ""},`,
        "",
        `คุณได้รับคำเชิญเข้าร่วมร้าน ${restaurantName} ในบทบาท ${roleLabel(invitation.role, language)}`,
        `เปิดลิงก์นี้เพื่อดูรายละเอียดและรับคำเชิญ: ${inviteUrl(invitation.token)}`,
        "",
        "หากลิงก์หมดอายุ กรุณาติดต่อผู้จัดการร้านเพื่อขอลิงก์ใหม่",
      ].join("\n")
    : [
        `Hello${invitation.email ? ` ${invitation.email}` : ""},`,
        "",
        `You have been invited to join ${restaurantName} as ${roleLabel(invitation.role, language)}.`,
        `Open this link to review and accept the invitation: ${inviteUrl(invitation.token)}`,
        "",
        "If the link expires, ask the restaurant manager for a new invitation.",
      ].join("\n");

  return `mailto:${encodeURIComponent(invitation.email)}?${new URLSearchParams({ subject, body }).toString()}`;
}

function canManageTeam(roleName?: string) {
  return roleName === "owner" || roleName === "manager";
}

function canManageTarget(actorRole?: string, targetRole?: string, isSelf = false) {
  if (isSelf || !actorRole || !targetRole) return false;
  if (actorRole === "owner") return targetRole !== "owner";
  if (actorRole === "manager") return targetRole !== "owner" && targetRole !== "manager";
  return false;
}

function allowedRoleOptions(actorRole?: string, roles: Role[] = []) {
  return roles.filter((role) => {
    if (role.name === "owner") return false;
    if (actorRole === "manager" && role.name === "manager") return false;
    return true;
  });
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300";
  if (status === "suspended") return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function parseAuditDetails(details: string) {
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function auditMessage(log: RestaurantAuditLog, language: Language) {
  const details = parseAuditDetails(log.details);
  const roleName = typeof details.role_name === "string" ? details.role_name : "";
  const email = typeof details.email === "string" ? details.email : "";
  const fromStatus = typeof details.from_status === "string" ? details.from_status : "";
  const toStatus = typeof details.to_status === "string" ? details.to_status : "";
  const fromRole = typeof details.from_role === "string" ? details.from_role : "";
  const toRole = typeof details.to_role === "string" ? details.to_role : "";

  if (log.action === "invitation_created") {
    return language === "th"
      ? `สร้างคำเชิญ ${roleLabel(roleName, language)}${email ? ` · ${email}` : ""}`
      : `Created invitation for ${roleLabel(roleName, language)}${email ? ` · ${email}` : ""}`;
  }
  if (log.action === "invitation_revoked") {
    return language === "th" ? `ยกเลิกคำเชิญ${email ? ` · ${email}` : ""}` : `Revoked invitation${email ? ` · ${email}` : ""}`;
  }
  if (log.action === "invitation_accepted") {
    return language === "th"
      ? `รับคำเชิญเข้าร่วมร้าน${roleName ? ` เป็น ${roleLabel(roleName, language)}` : ""}`
      : `Accepted invitation${roleName ? ` as ${roleLabel(roleName, language)}` : ""}`;
  }
  if (log.action === "member_status_changed") {
    return language === "th"
      ? `เปลี่ยนสถานะสมาชิก ${STATUS_LABELS.th[fromStatus] ?? fromStatus} -> ${STATUS_LABELS.th[toStatus] ?? toStatus}`
      : `Changed member status ${STATUS_LABELS.en[fromStatus] ?? fromStatus} -> ${STATUS_LABELS.en[toStatus] ?? toStatus}`;
  }
  if (log.action === "member_role_changed") {
    return language === "th"
      ? `เปลี่ยนบทบาท ${ROLE_LABELS.th[fromRole] ?? fromRole} -> ${ROLE_LABELS.th[toRole] ?? toRole}`
      : `Changed role ${ROLE_LABELS.en[fromRole] ?? fromRole} -> ${ROLE_LABELS.en[toRole] ?? toRole}`;
  }
  return log.action;
}

function actorName(log: RestaurantAuditLog, language: Language) {
  const user = log.actor_user;
  if (!user) return language === "th" ? "ระบบ" : "System";
  if (user.nickname?.trim()) return user.nickname.trim();
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}

function replaceMember(current: Membership[], nextMember: Membership) {
  return current.map((member) => (member.ID === nextMember.ID ? nextMember : member));
}

export default function StaffPage() {
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const restaurantId = activeMembership?.restaurant_id;
  const activeRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeRole);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<RestaurantAuditLog[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copiedToken, setCopiedToken] = useState("");
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const createOnceRef = useRef(createSingleFlight());
  const revokeLocksRef = useRef<Set<number>>(new Set());
  const memberLocksRef = useRef<Set<number>>(new Set());
  const [revokingIds, setRevokingIds] = useState<number[]>([]);
  const [updatingMemberIds, setUpdatingMemberIds] = useState<number[]>([]);

  const copy = language === "th"
    ? {
        eyebrow: "Team management",
        title: "พนักงานและคำเชิญ",
        subtitle: "จัดการสมาชิกในร้าน สร้างคำเชิญ และดูประวัติการเปลี่ยนแปลงของทีม",
        refresh: "รีเฟรช",
        loadError: "โหลดข้อมูลทีมไม่สำเร็จ",
        emailError: "รูปแบบอีเมลไม่ถูกต้อง",
        createError: "สร้างคำเชิญไม่สำเร็จ",
        copyError: "คัดลอกลิงก์ไม่ได้",
        revokeError: "ยกเลิกคำเชิญไม่สำเร็จ",
        memberError: "อัปเดตข้อมูลสมาชิกไม่สำเร็จ",
        noPermissionTitle: "บัญชีนี้ดูทีมได้ แต่จัดการคำเชิญหรือเปลี่ยนสถานะสมาชิกไม่ได้",
        noPermissionBody: "เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่เชิญ ยกเลิกคำเชิญ และจัดการ member lifecycle ได้",
        membersTitle: "สมาชิกในร้าน",
        membersHint: "เจ้าของร้านและผู้จัดการจะเห็นสมาชิกที่ถูกระงับหรือนำออกแล้วด้วย",
        name: "ชื่อ",
        role: "บทบาท",
        permission: "สิทธิ์",
        joined: "เข้าร่วม",
        status: "สถานะ",
        actions: "จัดการ",
        restore: "กู้คืน",
        suspend: "ระงับ",
        remove: "นำออก",
        yourAccount: "บัญชีของคุณ",
        noMembers: "ยังไม่มีสมาชิกในร้านนี้",
        pendingTitle: "คำเชิญที่รอรับ",
        pendingHint: "ลิงก์แบบ token ใช้สำหรับรับคำเชิญผ่านหน้า `/invitations/[token]`",
        openLink: "ลิงก์เปิดสำหรับทุกบัญชี",
        rolePrefix: "บทบาท",
        expiresPrefix: "หมดอายุ",
        copied: "คัดลอกแล้ว",
        copy: "คัดลอก",
        sendEmail: "ส่งอีเมล",
        revoking: "กำลังยกเลิก",
        revoke: "ยกเลิก",
        noPendingTitle: "ยังไม่มีคำเชิญที่รอรับ",
        noPendingBody: "สร้างคำเชิญใหม่จากแผงด้านขวา",
        auditTitle: "ประวัติการเปลี่ยนแปลงทีม",
        auditHint: "เก็บเหตุการณ์สำคัญของคำเชิญและการจัดการสมาชิกไว้ย้อนหลัง",
        by: "โดย",
        target: "เป้าหมาย",
        noAudit: "ยังไม่มีประวัติในช่วงนี้",
        auditDenied: "เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่ดู audit log ได้",
        inviteTitle: "เชิญพนักงาน",
        inviteHint: "เลือกบทบาทแล้วสร้างลิงก์เชิญ จากนั้นคัดลอกหรือเปิดอีเมลเพื่อนำส่งต่อ",
        emailLabel: "อีเมลพนักงาน",
        emailPlaceholder: "staff@example.com หรือเว้นว่าง",
        emailHelp: "ถ้ามีอีเมล ระบบจะช่วยเปิด mail client เพื่อส่งลิงก์เชิญต่อได้เร็วขึ้น",
        expiry: "วันหมดอายุ",
        day: "วัน",
        noExpiry: "ไม่หมดอายุ",
        creating: "กำลังสร้างคำเชิญ...",
        createLink: "สร้างลิงก์เชิญ",
        flowTitle: "Flow การเข้าร่วมแบบสมบูรณ์",
        flow: [
          "1. เจ้าของหรือผู้จัดการสร้างลิงก์เชิญพร้อมบทบาท",
          "2. พนักงานเปิด `/invitations/[token]` เพื่อตรวจร้าน อีเมล และวันหมดอายุ",
          "3. ถ้ายังไม่ login ให้เข้าสู่ระบบก่อนในหน้าเดียวกัน",
          "4. กดรับคำเชิญแล้วระบบสร้างหรือกู้คืน membership พร้อมเลือก active restaurant ให้อัตโนมัติ",
        ],
      }
    : {
        eyebrow: "Team management",
        title: "Staff and invitations",
        subtitle: "Manage restaurant members, create invitations, and review team activity history.",
        refresh: "Refresh",
        loadError: "Could not load team data.",
        emailError: "Email format is invalid.",
        createError: "Could not create invitation.",
        copyError: "Could not copy invitation link.",
        revokeError: "Could not revoke invitation.",
        memberError: "Could not update member details.",
        noPermissionTitle: "This account can view the team but cannot manage invitations or member status.",
        noPermissionBody: "Only owners and managers can invite people, revoke invitations, and manage the member lifecycle.",
        membersTitle: "Restaurant members",
        membersHint: "Owners and managers can also see suspended and removed members.",
        name: "Name",
        role: "Role",
        permission: "Permissions",
        joined: "Joined",
        status: "Status",
        actions: "Actions",
        restore: "Restore",
        suspend: "Suspend",
        remove: "Remove",
        yourAccount: "Your account",
        noMembers: "No members in this restaurant yet.",
        pendingTitle: "Pending invitations",
        pendingHint: "Token links are accepted through `/invitations/[token]`.",
        openLink: "Open link for any account",
        rolePrefix: "Role",
        expiresPrefix: "Expires",
        copied: "Copied",
        copy: "Copy",
        sendEmail: "Send email",
        revoking: "Revoking",
        revoke: "Revoke",
        noPendingTitle: "No pending invitations",
        noPendingBody: "Create a new invitation from the right panel.",
        auditTitle: "Team activity history",
        auditHint: "Important invitation and member-management events are kept here.",
        by: "By",
        target: "Target",
        noAudit: "No recent activity yet.",
        auditDenied: "Only owners and managers can view the audit log.",
        inviteTitle: "Invite staff",
        inviteHint: "Choose a role, create an invitation link, then copy it or open an email handoff.",
        emailLabel: "Staff email",
        emailPlaceholder: "staff@example.com or leave blank",
        emailHelp: "If an email is set, the app can open your mail client with the invitation link ready.",
        expiry: "Expiry",
        day: "day",
        noExpiry: "No expiry",
        creating: "Creating invitation...",
        createLink: "Create invitation link",
        flowTitle: "Complete join flow",
        flow: [
          "1. Owner or manager creates an invitation link with a role.",
          "2. Staff opens `/invitations/[token]` to review the restaurant, email, and expiry.",
          "3. If they are not signed in, they sign in on the same page.",
          "4. Accepting the invitation creates or restores the membership and selects the restaurant automatically.",
        ],
      };

  const inviteRoles = useMemo(() => allowedRoleOptions(activeRole, roles), [activeRole, roles]);

  const refresh = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const [membersRes, rolesRes, invitationsRes, logsRes] = await Promise.all([
        listMembers(restaurantId),
        getRoles(),
        allowed ? listPendingInvitations(restaurantId) : Promise.resolve({ data: { invitations: [] } }),
        allowed ? listAuditLogs(restaurantId, 25) : Promise.resolve({ data: { logs: [] } }),
      ]);

      const roleList = (rolesRes?.data?.data ?? []) as Role[];
      const nextInviteRoles = allowedRoleOptions(activeRole, roleList);
      setMembers(membersRes.data.members ?? []);
      setInvitations(invitationsRes.data.invitations ?? []);
      setAuditLogs(logsRes.data.logs ?? []);
      setRoles(roleList);
      if (!roleId) {
        const nextDefault = nextInviteRoles.find((role) => role.name === "waiter") ?? nextInviteRoles[0];
        if (nextDefault) setRoleId(nextDefault.ID);
      }
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, allowed, language]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restaurantId || !allowed || !roleId) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setInviteError(copy.emailError);
      return;
    }

    await createOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      setInviteError("");
      try {
        const days = Number.parseInt(expiresInDays, 10);
        const res = await createInvitation(restaurantId, {
          role_id: Number(roleId),
          email: trimmedEmail,
          expires_in_days: Number.isFinite(days) ? days : 0,
        });
        setInvitations((current) => [res.data, ...current]);
        setEmail("");
        setCopiedToken("");
        await refresh();
      } catch {
        setInviteError(copy.createError);
      } finally {
        setSubmitting(false);
      }
    });
  };

  const copyInvite = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopiedToken(token);
    } catch {
      setError(copy.copyError);
    }
  };

  const sendInviteEmail = (invitation: Invitation) => {
    if (!invitation.email) return;
    window.location.href = inviteMailto(invitation, language);
  };

  const revokeInvite = async (invitationId: number) => {
    if (!restaurantId || revokeLocksRef.current.has(invitationId)) return;
    revokeLocksRef.current.add(invitationId);
    setRevokingIds((current) => [...current, invitationId]);
    setError("");
    try {
      await revokeInvitation(restaurantId, invitationId);
      setInvitations((current) => current.filter((item) => item.ID !== invitationId));
      await refresh();
    } catch {
      setError(copy.revokeError);
    } finally {
      revokeLocksRef.current.delete(invitationId);
      setRevokingIds((current) => current.filter((id) => id !== invitationId));
    }
  };

  const withMemberLock = async (memberId: number, action: () => Promise<void>) => {
    if (memberLocksRef.current.has(memberId)) return;
    memberLocksRef.current.add(memberId);
    setUpdatingMemberIds((current) => [...current, memberId]);
    setError("");
    try {
      await action();
    } catch {
      setError(copy.memberError);
    } finally {
      memberLocksRef.current.delete(memberId);
      setUpdatingMemberIds((current) => current.filter((id) => id !== memberId));
    }
  };

  const changeMemberStatus = async (memberId: number, status: MembershipStatus) => {
    if (!restaurantId) return;
    await withMemberLock(memberId, async () => {
      const res = await updateMemberStatus(restaurantId, memberId, status);
      setMembers((current) => replaceMember(current, res.data.member));
      await refresh();
    });
  };

  const changeMemberRole = async (memberId: number, nextRoleId: string) => {
    if (!restaurantId) return;
    const parsed = Number.parseInt(nextRoleId, 10);
    if (!Number.isFinite(parsed)) return;
    await withMemberLock(memberId, async () => {
      const res = await updateMemberRole(restaurantId, memberId, parsed);
      setMembers((current) => replaceMember(current, res.data.member));
      await refresh();
    });
  };

  if (!restaurantId) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          {copy.refresh}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!allowed && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/15">
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">{copy.noPermissionTitle}</p>
          <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">{copy.noPermissionBody}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.membersTitle}</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.membersHint}</p>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                </div>
              ) : members.length ? (
                <div className="space-y-2">
                  <div className="hidden grid-cols-[minmax(220px,1.15fr)_minmax(220px,0.9fr)_120px_160px_minmax(170px,auto)] gap-4 border-b border-gray-100 pb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:border-gray-800 lg:grid">
                    <span>{copy.name}</span>
                    <span>{copy.role}</span>
                    <span>{copy.status}</span>
                    <span>{copy.joined}</span>
                    <span className="text-right">{copy.actions}</span>
                  </div>
                  {members.map((member) => {
                    const manageable = canManageTarget(activeRole, member.role?.name, member.user_id === user?.ID);
                    const roleOptions = allowedRoleOptions(activeRole, roles);
                    const busy = updatingMemberIds.includes(member.ID);

                    return (
                      <div key={member.ID} className="relative grid gap-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 lg:grid-cols-[minmax(220px,1.15fr)_minmax(220px,0.9fr)_120px_160px_minmax(170px,auto)] lg:items-center lg:border-0 lg:border-b lg:bg-transparent lg:px-0 lg:py-3 lg:last:border-b-0 lg:dark:bg-transparent">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-[12px] font-bold text-orange-700 dark:bg-orange-900/25 dark:text-orange-300">
                            {member.user?.profile_image ? (
                              <Image src={member.user.profile_image} alt={displayUserName(member, language)} width={40} height={40} unoptimized className="h-full w-full object-cover" />
                            ) : (
                              displayUserName(member, language).slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{displayUserName(member, language)}</p>
                            <p className="truncate text-[11px] text-gray-400">{member.user?.email}</p>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:hidden">{copy.role}</p>
                          {manageable ? (
                            <ThemedSelect
                              className="max-w-full lg:w-[220px]"
                              value={String(member.role_id)}
                              onChange={(next) => void changeMemberRole(member.ID, next)}
                              disabled={busy}
                              options={roleOptions.map((role) => ({
                                value: String(role.ID),
                                label: `${roleLabel(role, language)} · ${permissionSummary(role, language)}`,
                              }))}
                            />
                          ) : (
                            <div>
                              <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{roleLabel(member.role, language)}</p>
                              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{permissionSummary(member.role, language)}</p>
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:hidden">{copy.status}</p>
                          <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${statusTone(member.status)}`}>
                            {STATUS_LABELS[language][member.status] ?? member.status}
                          </span>
                        </div>

                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:hidden">{copy.joined}</p>
                          <p className="text-[12px] text-gray-500 dark:text-gray-400">{formatDate(member.joined_at, language)}</p>
                        </div>

                        <div>
                          {manageable ? (
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              {member.status !== "active" ? (
                                <button type="button" onClick={() => void changeMemberStatus(member.ID, "active")} disabled={busy} className="h-9 rounded-md border border-emerald-200 bg-white px-3 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/50 dark:bg-gray-950 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                                  {copy.restore}
                                </button>
                              ) : (
                                <button type="button" onClick={() => void changeMemberStatus(member.ID, "suspended")} disabled={busy} className="h-9 rounded-md border border-amber-200 bg-white px-3 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/50 dark:bg-gray-950 dark:text-amber-300 dark:hover:bg-amber-900/20">
                                  {copy.suspend}
                                </button>
                              )}
                              <button type="button" onClick={() => void changeMemberStatus(member.ID, "removed")} disabled={busy || member.status === "removed"} className="h-9 rounded-md border border-red-200 bg-white px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20">
                                {copy.remove}
                              </button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 lg:text-right">
                              {member.user_id === user?.ID ? copy.yourAccount : "-"}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  {copy.noMembers}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.pendingTitle}</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.pendingHint}</p>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : invitations.length ? (
                <div className="space-y-2">
                  {invitations.map((invitation) => (
                    <div key={invitation.ID} className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{invitation.email || copy.openLink}</p>
                          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                            {copy.rolePrefix} {roleLabel(invitation.role, language)} · {copy.expiresPrefix} {formatDate(invitation.expires_at, language)}
                          </p>
                          <p className="mt-1 truncate font-mono text-[11px] text-gray-400">{inviteUrl(invitation.token)}</p>
                        </div>
                        {allowed && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button type="button" onClick={() => void copyInvite(invitation.token)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800">
                              {copiedToken === invitation.token ? copy.copied : copy.copy}
                            </button>
                            {invitation.email && (
                              <button type="button" onClick={() => sendInviteEmail(invitation)} className="h-9 rounded-md border border-sky-200 bg-white px-3 text-[12px] font-medium text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-900/50 dark:bg-gray-950 dark:text-sky-300 dark:hover:bg-sky-900/20">
                                {copy.sendEmail}
                              </button>
                            )}
                            <button type="button" onClick={() => void revokeInvite(invitation.ID)} disabled={revokingIds.includes(invitation.ID)} className="h-9 rounded-md border border-red-200 bg-white px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20">
                              {revokingIds.includes(invitation.ID) ? copy.revoking : copy.revoke}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-white">{copy.noPendingTitle}</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.noPendingBody}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.auditTitle}</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.auditHint}</p>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : allowed ? (
                auditLogs.length ? (
                  <div className="space-y-2">
                    {auditLogs.map((log) => (
                      <div key={log.ID} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-gray-900 dark:text-white">{auditMessage(log, language)}</p>
                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                              {copy.by} {actorName(log, language)}
                              {log.target_user ? ` · ${copy.target} ${log.target_user.email}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] text-gray-400">{formatDate(log.CreatedAt, language)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                    {copy.noAudit}
                  </div>
                )
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  {copy.auditDenied}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={createInvite} className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.inviteTitle}</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.inviteHint}</p>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.emailLabel}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setInviteError("");
                  }}
                  placeholder={copy.emailPlaceholder}
                  disabled={!allowed}
                  aria-invalid={Boolean(inviteError)}
                  className={`h-10 w-full rounded-md border bg-white px-3 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 disabled:opacity-60 dark:bg-gray-900 ${
                    inviteError ? "border-red-300 dark:border-red-900/60" : "border-gray-200 dark:border-gray-700"
                  }`}
                />
                <p className={`mt-1 text-[11px] ${inviteError ? "font-medium text-red-600 dark:text-red-300" : "text-gray-400 dark:text-gray-500"}`}>
                  {inviteError || copy.emailHelp}
                </p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.role}</span>
                <ThemedSelect
                  value={String(roleId || inviteRoles[0]?.ID || "")}
                  onChange={(next) => setRoleId(Number(next))}
                  disabled={!allowed}
                  options={inviteRoles.map((role) => ({
                    value: String(role.ID),
                    label: `${roleLabel(role, language)} · ${permissionSummary(role, language)}`,
                  }))}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.expiry}</span>
                <ThemedSelect
                  value={expiresInDays}
                  onChange={setExpiresInDays}
                  disabled={!allowed}
                  options={[
                    { value: "1", label: `1 ${copy.day}` },
                    { value: "3", label: `3 ${copy.day}` },
                    { value: "7", label: `7 ${copy.day}` },
                    { value: "14", label: `14 ${copy.day}` },
                    { value: "0", label: copy.noExpiry },
                  ]}
                />
              </label>

              <button type="submit" disabled={!allowed || !roleId || submitting} className="h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900">
                {submitting ? copy.creating : copy.createLink}
              </button>
            </div>
          </form>

          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{copy.flowTitle}</p>
            <div className="mt-3 space-y-2 text-[12px] text-gray-500 dark:text-gray-400">
              {copy.flow.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
