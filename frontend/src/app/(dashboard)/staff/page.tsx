"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { getRoles } from "@/src/lib/auth";
import { createInvitation, listPendingInvitations, revokeInvitation } from "@/src/lib/invitation";
import { listMembers } from "@/src/lib/restaurant";
import type { Invitation, Membership } from "@/src/types/restaurant";
import type { Role } from "@/src/types/role";
import { Skeleton, RestaurantCardSkeleton } from "@/src/components/shared/Skeleton";
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

function canManageTeam(roleName?: string) {
  return roleName === "owner" || roleName === "manager";
}

export default function StaffPage() {
  const { activeMembership } = useAuth();
  const restaurantId = activeMembership?.restaurant_id;
  const activeRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeRole);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
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
  const [revokingIds, setRevokingIds] = useState<number[]>([]);

  const inviteRoles = useMemo(() => roles.filter((role) => role.name !== "owner"), [roles]);
  const defaultRole = inviteRoles.find((role) => role.name === "waiter") ?? inviteRoles[0];

  const refresh = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const [membersRes, invitationsRes, rolesRes] = await Promise.all([
        listMembers(restaurantId),
        allowed ? listPendingInvitations(restaurantId) : Promise.resolve({ data: { invitations: [] } }),
        getRoles(),
      ]);
      setMembers(membersRes.data.members ?? []);
      setInvitations(invitationsRes.data.invitations ?? []);
      const roleList = (rolesRes?.data?.data ?? []) as Role[];
      setRoles(roleList);
      if (!roleId) {
        const nextDefault = roleList.find((role) => role.name === "waiter") ?? roleList.find((role) => role.name !== "owner");
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
        setEmail("");
        setCopiedToken("");
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

  const revokeInvite = async (invitationId: number) => {
    if (!restaurantId) return;
    if (revokeLocksRef.current.has(invitationId)) return;
    revokeLocksRef.current.add(invitationId);
    setRevokingIds((current) => [...current, invitationId]);
    setError("");
    try {
      await revokeInvitation(restaurantId, invitationId);
      setInvitations((current) => current.filter((item) => item.ID !== invitationId));
    } catch {
      setError("ยกเลิกคำเชิญไม่สำเร็จ");
    } finally {
      revokeLocksRef.current.delete(invitationId);
      setRevokingIds((current) => current.filter((id) => id !== invitationId));
    }
  };

  if (!restaurantId) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Team management</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">พนักงานและคำเชิญ</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">จัดการสมาชิกในร้านและสร้างลิงก์เชิญสำหรับพนักงานใหม่</p>
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
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">บัญชีนี้ดูทีมได้ แต่สร้างคำเชิญไม่ได้</p>
          <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่เชิญและยกเลิกคำเชิญได้</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">สมาชิกในร้าน</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">รายชื่อมาจาก `restaurant_members` ของร้านปัจจุบัน</p>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  <RestaurantCardSkeleton />
                  <RestaurantCardSkeleton />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-[12px]">
                    <thead className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                      <tr>
                        <th className="py-2 font-semibold">ชื่อ</th>
                        <th className="py-2 font-semibold">บทบาท</th>
                        <th className="py-2 font-semibold">สิทธิ์</th>
                        <th className="py-2 font-semibold">เข้าร่วม</th>
                        <th className="py-2 text-right font-semibold">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.ID} className="border-b border-gray-50 last:border-0 dark:border-gray-800/70">
                          <td className="py-3">
                            <p className="font-medium text-gray-900 dark:text-white">{displayUserName(member)}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{member.user?.email ?? "-"}</p>
                          </td>
                          <td className="py-3 text-gray-700 dark:text-gray-300">{roleLabel(member.role)}</td>
                          <td className="py-3 text-gray-500 dark:text-gray-400">{permissionSummary(member.role)}</td>
                          <td className="py-3 text-gray-500 dark:text-gray-400">{formatDate(member.joined_at)}</td>
                          <td className="py-3 text-right">
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                              {STATUS_LABEL[member.status] ?? member.status}
                            </span>
                          </td>
                        </tr>
                      ))}
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
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">ลิงก์แบบ token ใช้ครั้งเดียว เมื่อรับแล้วคำเชิญจะเปลี่ยนเป็น accepted</p>
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
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white">{invitation.email || "ลิงก์เปิดสำหรับทุกบัญชี"}</p>
                          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                            บทบาท {roleLabel(invitation.role)} · หมดอายุ {formatDate(invitation.expires_at)}
                          </p>
                          <p className="mt-1 truncate font-mono text-[11px] text-gray-400">{inviteUrl(invitation.token)}</p>
                        </div>
                        {allowed && (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => copyInvite(invitation.token)}
                              className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              {copiedToken === invitation.token ? "คัดลอกแล้ว" : "คัดลอก"}
                            </button>
                            <button
                              type="button"
                              onClick={() => revokeInvite(invitation.ID)}
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
        </section>

        <aside className="space-y-4">
          <form onSubmit={createInvite} className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">เชิญพนักงาน</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">เลือกบทบาทและสร้างลิงก์ token สำหรับส่งให้พนักงาน</p>
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
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">เว้นว่างได้ถ้าต้องการให้ใครก็ได้ที่มีลิงก์รับคำเชิญ</p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">บทบาท</span>
                <ThemedSelect
                  value={String(roleId || defaultRole?.ID || "")}
                  onChange={(next) => setRoleId(Number(next))}
                  disabled={!allowed}
                  options={inviteRoles.map((role) => ({ value: String(role.ID), label: `${roleLabel(role)} · ${permissionSummary(role)}` }))}
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
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">Flow การเข้าร่วม</p>
            <div className="mt-3 space-y-2 text-[12px] text-gray-500 dark:text-gray-400">
              <p>1. เจ้าของหรือผู้จัดการสร้างลิงก์เชิญ</p>
              <p>2. พนักงานเปิด `/invitations/[token]`</p>
              <p>3. ถ้ายังไม่ login ให้เข้าสู่ระบบก่อน</p>
              <p>4. กดรับคำเชิญแล้วระบบสร้าง membership และเข้า dashboard</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
