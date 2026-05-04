"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { getRoles } from "@/src/lib/auth";
import { createInvitation, listPendingInvitations, revokeInvitation } from "@/src/lib/invitation";
import { listAuditLogs, listMembers, updateMemberRole, updateMemberStatus } from "@/src/lib/restaurant";
import type { Invitation, Membership, MembershipStatus, RestaurantAuditLog } from "@/src/types/restaurant";
import type { Role } from "@/src/types/role";
import { RestaurantCardSkeleton, Skeleton } from "@/src/components/shared/Skeleton";
import { createSingleFlight } from "@/src/lib/singleFlight";
import ThemedSelect from "@/src/components/shared/ThemedSelect";

const ROLE_LABEL: Record<string, string> = {
  owner: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  cashier: "แคชเชียร์",
  waiter: "พนักงานเสิร์ฟ",
  chef: "ครัว",
};

const STATUS_LABEL: Record<string, string> = {
  active: "ใช้งาน",
  suspended: "ระงับ",
  removed: "นำออกแล้ว",
  pending: "รอรับคำเชิญ",
};

function roleLabel(role?: Role | null) {
  if (!role) return "พนักงาน";
  return ROLE_LABEL[role.name] ?? role.name;
}

function permissionSummary(role?: Role | null) {
  if (!role) return "พื้นฐาน";
  if (role.permissions === `["*"]`) return "ทุกเมนู";
  try {
    const permissions = JSON.parse(role.permissions) as string[];
    return permissions.length ? `${permissions.length} สิทธิ์` : "พื้นฐาน";
  } catch {
    return "พื้นฐาน";
  }
}

function displayUserName(member: Membership) {
  const user = member.user;
  if (!user) return "สมาชิก";
  const parts = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter((part) => part && part !== "-");
  return parts.length ? parts.join(" ") : user.email;
}

function formatDate(value?: string | null) {
  if (!value) return "ไม่กำหนด";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่กำหนด";
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function inviteUrl(token: string) {
  if (typeof window === "undefined") return `/invitations/${token}`;
  return `${window.location.origin}/invitations/${token}`;
}

function inviteMailto(invitation: Invitation) {
  const subject = `คำเชิญเข้าร่วมร้าน ${invitation.restaurant?.name ?? "Restaurant Hub"}`;
  const body = [
    `สวัสดี${invitation.email ? ` ${invitation.email}` : ""},`,
    "",
    `คุณได้รับคำเชิญเข้าร่วมร้าน ${invitation.restaurant?.name ?? "Restaurant Hub"} ในบทบาท ${roleLabel(invitation.role)}`,
    `เปิดลิงก์นี้เพื่อดูรายละเอียดและรับคำเชิญ: ${inviteUrl(invitation.token)}`,
    "",
    "หากลิงก์หมดอายุ กรุณาติดต่อผู้จัดการร้านเพื่อขอลิงก์ใหม่",
  ].join("\n");

  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${encodeURIComponent(invitation.email)}?${params.toString()}`;
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

function auditMessage(log: RestaurantAuditLog) {
  const details = parseAuditDetails(log.details);
  const roleName = typeof details.role_name === "string" ? details.role_name : "";
  const email = typeof details.email === "string" ? details.email : "";
  const fromStatus = typeof details.from_status === "string" ? details.from_status : "";
  const toStatus = typeof details.to_status === "string" ? details.to_status : "";
  const fromRole = typeof details.from_role === "string" ? details.from_role : "";
  const toRole = typeof details.to_role === "string" ? details.to_role : "";

  if (log.action === "invitation_created") {
    return `สร้างคำเชิญ ${roleLabel(roleName ? ({ name: roleName } as Role) : undefined)}${email ? ` · ${email}` : ""}`;
  }
  if (log.action === "invitation_revoked") {
    return `ยกเลิกคำเชิญ${email ? ` · ${email}` : ""}`;
  }
  if (log.action === "invitation_accepted") {
    return `รับคำเชิญเข้าร่วมร้าน${roleName ? ` เป็น ${roleLabel({ name: roleName, ID: 0, permissions: "[]" })}` : ""}`;
  }
  if (log.action === "member_status_changed") {
    return `เปลี่ยนสถานะสมาชิก ${STATUS_LABEL[fromStatus] ?? fromStatus} → ${STATUS_LABEL[toStatus] ?? toStatus}`;
  }
  if (log.action === "member_role_changed") {
    return `เปลี่ยนบทบาท ${ROLE_LABEL[fromRole] ?? fromRole} → ${ROLE_LABEL[toRole] ?? toRole}`;
  }
  return log.action;
}

function actorName(log: RestaurantAuditLog) {
  const user = log.actor_user;
  if (!user) return "ระบบ";
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
  const createOnceRef = useRef(createSingleFlight());
  const revokeLocksRef = useRef<Set<number>>(new Set());
  const memberLocksRef = useRef<Set<number>>(new Set());
  const [revokingIds, setRevokingIds] = useState<number[]>([]);
  const [updatingMemberIds, setUpdatingMemberIds] = useState<number[]>([]);

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
      setMembers(membersRes.data.members ?? []);
      setInvitations(invitationsRes.data.invitations ?? []);
      setAuditLogs(logsRes.data.logs ?? []);
      setRoles(roleList);
      if (!roleId) {
        const nextDefault = allowedRoleOptions(activeRole, roleList).find((role) => role.name === "waiter")
          ?? allowedRoleOptions(activeRole, roleList)[0];
        if (nextDefault) setRoleId(nextDefault.ID);
      }
    } catch {
      setError("โหลดข้อมูลทีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, allowed]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restaurantId || !allowed || !roleId) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }

    await createOnceRef.current(async () => {
      setSubmitting(true);
      setError("");
      try {
        const days = Number.parseInt(expiresInDays, 10);
        const res = await createInvitation(restaurantId, {
          role_id: Number(roleId),
          email: trimmedEmail,
          expires_in_days: Number.isFinite(days) ? days : 0,
        });
        setInvitations((current) => [res.data, ...current]);
        setAuditLogs((current) => current);
        setEmail("");
        setCopiedToken("");
        await refresh();
      } catch {
        setError("สร้างคำเชิญไม่สำเร็จ");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const copyInvite = async (token: string) => {
    const url = inviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
    } catch {
      setError("คัดลอกลิงก์ไม่ได้");
    }
  };

  const sendInviteEmail = (invitation: Invitation) => {
    if (!invitation.email) return;
    window.location.href = inviteMailto(invitation);
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
      setError("ยกเลิกคำเชิญไม่สำเร็จ");
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
      setError("อัปเดตข้อมูลสมาชิกไม่สำเร็จ");
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
            Team management
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
            พนักงานและคำเชิญ
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            จัดการสมาชิกในร้าน สร้างคำเชิญ และดูประวัติการเปลี่ยนแปลงของทีม
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          รีเฟรช
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!allowed && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/15">
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
            บัญชีนี้ดูทีมได้ แต่จัดการคำเชิญหรือเปลี่ยนสถานะสมาชิกไม่ได้
          </p>
          <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">
            เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่เชิญ ยกเลิกคำเชิญ และจัดการ member lifecycle ได้
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">สมาชิกในร้าน</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                เจ้าของร้านและผู้จัดการจะเห็นสมาชิกที่ถูกระงับหรือนำออกแล้วด้วย
              </p>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-[12px]">
                    <thead className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                      <tr>
                        <th className="py-2 font-semibold">ชื่อ</th>
                        <th className="py-2 font-semibold">บทบาท</th>
                        <th className="py-2 font-semibold">สิทธิ์</th>
                        <th className="py-2 font-semibold">เข้าร่วม</th>
                        <th className="py-2 font-semibold">สถานะ</th>
                        <th className="py-2 text-right font-semibold">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => {
                        const manageable = canManageTarget(activeRole, member.role?.name, member.user_id === user?.ID);
                        const roleOptions = allowedRoleOptions(activeRole, roles);
                        const busy = updatingMemberIds.includes(member.ID);

                        return (
                          <tr key={member.ID} className="border-b border-gray-50 last:border-0 dark:border-gray-800/70">
                            <td className="py-3">
                              <p className="font-medium text-gray-900 dark:text-white">{displayUserName(member)}</p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">{member.user?.email ?? "-"}</p>
                            </td>
                            <td className="py-3">
                              {manageable ? (
                                <div className="w-[180px]">
                                  <ThemedSelect
                                    value={String(member.role_id)}
                                    onChange={(next) => void changeMemberRole(member.ID, next)}
                                    disabled={busy}
                                    options={roleOptions.map((role) => ({
                                      value: String(role.ID),
                                      label: `${roleLabel(role)} · ${permissionSummary(role)}`,
                                    }))}
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-700 dark:text-gray-300">{roleLabel(member.role)}</span>
                              )}
                            </td>
                            <td className="py-3 text-gray-500 dark:text-gray-400">{permissionSummary(member.role)}</td>
                            <td className="py-3 text-gray-500 dark:text-gray-400">{formatDate(member.joined_at)}</td>
                            <td className="py-3">
                              <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${statusTone(member.status)}`}>
                                {STATUS_LABEL[member.status] ?? member.status}
                              </span>
                            </td>
                            <td className="py-3">
                              {manageable ? (
                                <div className="flex justify-end gap-2">
                                  {member.status !== "active" ? (
                                    <button
                                      type="button"
                                      onClick={() => void changeMemberStatus(member.ID, "active")}
                                      disabled={busy}
                                      className="h-8 rounded-md border border-emerald-200 bg-white px-3 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/50 dark:bg-gray-950 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                    >
                                      กู้คืน
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void changeMemberStatus(member.ID, "suspended")}
                                      disabled={busy}
                                      className="h-8 rounded-md border border-amber-200 bg-white px-3 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/50 dark:bg-gray-950 dark:text-amber-300 dark:hover:bg-amber-900/20"
                                    >
                                      ระงับ
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void changeMemberStatus(member.ID, "removed")}
                                    disabled={busy || member.status === "removed"}
                                    className="h-8 rounded-md border border-red-200 bg-white px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20"
                                  >
                                    นำออก
                                  </button>
                                </div>
                              ) : (
                                <p className="text-right text-[11px] text-gray-400 dark:text-gray-500">
                                  {member.user_id === user?.ID ? "บัญชีของคุณ" : "-"}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {members.length === 0 && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                      ยังไม่มีสมาชิกในร้านนี้
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">คำเชิญที่รอรับ</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                ลิงก์แบบ token ใช้สำหรับรับคำเชิญผ่านหน้า `/invitations/[token]`
              </p>
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
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                            {invitation.email || "ลิงก์เปิดสำหรับทุกบัญชี"}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                            บทบาท {roleLabel(invitation.role)} · หมดอายุ {formatDate(invitation.expires_at)}
                          </p>
                          <p className="mt-1 truncate font-mono text-[11px] text-gray-400">
                            {inviteUrl(invitation.token)}
                          </p>
                        </div>
                        {allowed && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void copyInvite(invitation.token)}
                              className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              {copiedToken === invitation.token ? "คัดลอกแล้ว" : "คัดลอก"}
                            </button>
                            {invitation.email && (
                              <button
                                type="button"
                                onClick={() => sendInviteEmail(invitation)}
                                className="h-8 rounded-md border border-sky-200 bg-white px-3 text-[12px] font-medium text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-900/50 dark:bg-gray-950 dark:text-sky-300 dark:hover:bg-sky-900/20"
                              >
                                ส่งอีเมล
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void revokeInvite(invitation.ID)}
                              disabled={revokingIds.includes(invitation.ID)}
                              className="h-8 rounded-md border border-red-200 bg-white px-3 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {revokingIds.includes(invitation.ID) ? "กำลังยกเลิก" : "ยกเลิก"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-white">ยังไม่มีคำเชิญที่รอรับ</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">สร้างคำเชิญใหม่จากแผงด้านขวา</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">ประวัติการเปลี่ยนแปลงทีม</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                เก็บเหตุการณ์สำคัญของคำเชิญและการจัดการสมาชิกไว้ย้อนหลัง
              </p>
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
                            <p className="text-[12px] font-medium text-gray-900 dark:text-white">{auditMessage(log)}</p>
                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                              โดย {actorName(log)}
                              {log.target_user ? ` · เป้าหมาย ${log.target_user.email}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] text-gray-400">{formatDate(log.CreatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                    ยังไม่มีประวัติในช่วงนี้
                  </div>
                )
              ) : (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่ดู audit log ได้
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <form onSubmit={createInvite} className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">เชิญพนักงาน</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                เลือกบทบาทแล้วสร้างลิงก์เชิญ จากนั้นคัดลอกหรือเปิดอีเมลเพื่อนำส่งต่อ
              </p>
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">อีเมลพนักงาน</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="staff@example.com หรือเว้นว่าง"
                  disabled={!allowed}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  ถ้ามีอีเมล ระบบจะช่วยเปิด mail client เพื่อส่งลิงก์เชิญต่อได้เร็วขึ้น
                </p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">บทบาท</span>
                <ThemedSelect
                  value={String(roleId || inviteRoles[0]?.ID || "")}
                  onChange={(next) => setRoleId(Number(next))}
                  disabled={!allowed}
                  options={inviteRoles.map((role) => ({
                    value: String(role.ID),
                    label: `${roleLabel(role)} · ${permissionSummary(role)}`,
                  }))}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">วันหมดอายุ</span>
                <ThemedSelect
                  value={expiresInDays}
                  onChange={setExpiresInDays}
                  disabled={!allowed}
                  options={[
                    { value: "1", label: "1 วัน" },
                    { value: "3", label: "3 วัน" },
                    { value: "7", label: "7 วัน" },
                    { value: "14", label: "14 วัน" },
                    { value: "0", label: "ไม่หมดอายุ" },
                  ]}
                />
              </label>

              <button
                type="submit"
                disabled={!allowed || !roleId || submitting}
                className="h-10 w-full rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
              >
                {submitting ? "กำลังสร้างคำเชิญ..." : "สร้างลิงก์เชิญ"}
              </button>
            </div>
          </form>

          <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">Flow การเข้าร่วมแบบสมบูรณ์</p>
            <div className="mt-3 space-y-2 text-[12px] text-gray-500 dark:text-gray-400">
              <p>1. เจ้าของหรือผู้จัดการสร้างลิงก์เชิญพร้อมบทบาท</p>
              <p>2. พนักงานเปิด `/invitations/[token]` เพื่อตรวจร้าน อีเมล และวันหมดอายุ</p>
              <p>3. ถ้ายังไม่ login ให้เข้าสู่ระบบก่อนในหน้าเดียวกัน</p>
              <p>4. กดรับคำเชิญแล้วระบบสร้างหรือกู้คืน membership พร้อมเลือก active restaurant ให้อัตโนมัติ</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
