"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/providers/AuthProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";
import { createRole, deleteRole, getRoles, updateRolePermissions } from "@/src/lib/auth";
import { createInvitation, listPendingInvitations, revokeInvitation } from "@/src/lib/invitation";
import { listAuditLogs, listMembers, updateMemberPermissions, updateMemberRole, updateMemberStatus } from "@/src/lib/restaurant";
import type { Invitation, Membership, MembershipStatus, RestaurantAuditLog } from "@/src/types/restaurant";
import type { Role } from "@/src/types/role";
import { RestaurantCardSkeleton, Skeleton } from "@/src/components/shared/Skeleton";
import { createSingleFlight } from "@/src/lib/singleFlight";
import ThemedSelect from "@/src/components/shared/ThemedSelect";
import { useConfirm, useToast } from "@/src/components/shared/FeedbackProvider";
import UserAvatar from "@/src/components/shared/UserAvatar";
import { useBackdropClose } from "@/src/hooks/useBackdropClose";
import { ChevronRight } from "lucide-react";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  STATUS_LABELS,
  actorName,
  auditMessage,
  displayUserName,
  effectiveMemberPermissions,
  formatDate,
  inviteMailto,
  inviteUrl,
  isCustomRole,
  memberPermissionSummary,
  parsePermissions,
  permissionSummary,
  roleLabel,
  stripHiddenPermissions,
  type PermissionTarget,
} from "./staffPageConfig";
import { allowedRoleOptions, canManageTarget, canManageTeam, replaceMember, statusTone } from "./staffPageUtils";

const AUDIT_PAGE_SIZE = 20;
const MOBILE_AUDIT_PAGE_SIZE = 5;

export default function StaffPage() {
  const { activeMembership, user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const restaurantId = activeMembership?.restaurant_id;
  const activeRole = activeMembership?.role?.name;
  const allowed = canManageTeam(activeMembership);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<RestaurantAuditLog[]>([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [auditMobilePage, setAuditMobilePage] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [newRoleName, setNewRoleName] = useState("");
  const [roleActionIds, setRoleActionIds] = useState<number[]>([]);
  const [creatingRole, setCreatingRole] = useState(false);
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
  const [permissionTarget, setPermissionTarget] = useState<PermissionTarget | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [useRolePermissions, setUseRolePermissions] = useState(false);
  const [permissionClosing, setPermissionClosing] = useState(false);
  const [roleManagerOpen, setRoleManagerOpen] = useState(false);
  const [roleManagerClosing, setRoleManagerClosing] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteModalClosing, setInviteModalClosing] = useState(false);

  const copy = language === "th"
    ? {
        eyebrow: "Team management",
        title: "พนักงานและคำเชิญ",
        subtitle: "จัดการสมาชิกในร้าน สร้างคำเชิญ และดูประวัติการเปลี่ยนแปลงของทีม",
        loadError: "โหลดข้อมูลทีมไม่สำเร็จ",
        emailError: "รูปแบบอีเมลไม่ถูกต้อง",
        createError: "สร้างคำเชิญไม่สำเร็จ",
        copyError: "คัดลอกลิงก์ไม่ได้",
        revokeError: "ยกเลิกคำเชิญไม่สำเร็จ",
        memberError: "อัปเดตข้อมูลสมาชิกไม่สำเร็จ",
        inviteCreated: "สร้างลิงก์เชิญแล้ว",
        inviteCopied: "คัดลอกลิงก์ไปยังคลิปบอร์ดแล้ว",
        inviteRevoked: "ยกเลิกคำเชิญแล้ว",
        memberUpdated: "อัปเดตข้อมูลพนักงานแล้ว",
        roleCreated: "สร้างบทบาทแล้ว",
        roleUpdated: "อัปเดตบทบาทแล้ว",
        roleDeleted: "ลบบทบาทแล้ว",
        roleError: "จัดการบทบาทไม่สำเร็จ",
        roleRequired: "กรอกชื่อบทบาทก่อน",
        rolePanelTitle: "บทบาทในร้าน",
        rolePanelAction: "เปิดการจัดการบทบาท",
        rolePanelSummary: "ตรวจสอบและปรับบทบาทมาตรฐานของร้านก่อนส่งคำเชิญพนักงาน",
        roleManagerTitle: "จัดการบทบาทและสิทธิ์",
        roleManagerHint: "เพิ่มบทบาทใหม่ แก้ชื่อบทบาทที่ปรับแต่งได้ และกำหนดชุดสิทธิ์ให้แต่ละบทบาท",
        customRoleTitle: "สร้างบทบาทใหม่",
        roleNameLabel: "ชื่อบทบาท",
        roleNamePlaceholder: "เช่น หัวหน้ากะ",
        createRole: "เพิ่มบทบาท",
        creatingRole: "กำลังเพิ่ม...",
        editPermissions: "สิทธิ์",
        deleteRole: "ลบ",
        customRoleBadge: "ปรับแต่ง",
        systemRoleBadge: "ระบบ",
        confirmRoleDeleteTitle: "ลบบทบาทนี้?",
        confirmRoleDeleteBody: "ลบได้เฉพาะบทบาทที่ไม่มีพนักงานหรือคำเชิญรอรับใช้งานอยู่ บทบาทที่ลบแล้วจะหายจากร้านนี้ด้วย",
        confirmRevokeTitle: "ยกเลิกคำเชิญนี้?",
        confirmRevokeBody: "ลิงก์นี้จะใช้งานไม่ได้ทันที และพนักงานต้องขอลิงก์ใหม่หากยังต้องเข้าร่วมร้าน",
        confirmMemberTitle: "ยืนยันการเปลี่ยนแปลงพนักงาน?",
        confirmMemberBody: "การเปลี่ยนบทบาทหรือสถานะจะมีผลกับสิทธิ์การใช้งานของพนักงานทันที",
        confirmAction: "ยืนยัน",
        cancelAction: "กลับไปก่อน",
        cancelRevokeAction: "ไม่ยกเลิก",
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
        loadMoreAudit: "โหลดประวัติเพิ่ม",
        loadingMoreAudit: "กำลังโหลด...",
        previousAuditPage: "ก่อนหน้า",
        nextAuditPage: "หน้าถัดไป",
        inviteTitle: "เพิ่มพนักงาน",
        inviteHint: "เลือกบทบาทแล้วสร้างลิงก์เชิญ จากนั้นคัดลอกหรือเปิดอีเมลเพื่อนำส่งต่อ",
        emailLabel: "อีเมลพนักงาน",
        emailPlaceholder: "staff@example.com หรือเว้นว่าง",
        emailHelp: "ถ้ามีอีเมล ระบบจะช่วยเปิด mail client เพื่อส่งลิงก์เชิญต่อได้เร็วขึ้น",
        expiry: "วันหมดอายุ",
        day: "วัน",
        noExpiry: "ไม่หมดอายุ",
        creating: "กำลังสร้างคำเชิญ...",
        createLink: "สร้างลิงก์เชิญ",
        flowTitle: "ขั้นตอนรับคำเชิญ",
        flow: [
          "เจ้าของหรือผู้จัดการกำหนดบทบาทและสร้างลิงก์คำเชิญ",
          "พนักงานเปิดลิงก์เพื่อตรวจสอบร้าน อีเมล และวันหมดอายุ",
          "เข้าสู่ระบบหรือสมัครบัญชีในหน้าเดียวกันหากยังไม่ได้ login",
          "กดรับคำเชิญแล้วระบบเพิ่มสมาชิกและเลือกร้านให้อัตโนมัติ",
        ],
      }
    : {
        eyebrow: "Team management",
        title: "Staff and invitations",
        subtitle: "Manage restaurant members, create invitations, and review team activity history.",
        loadError: "Could not load team data.",
        emailError: "Email format is invalid.",
        createError: "Could not create invitation.",
        copyError: "Could not copy invitation link.",
        revokeError: "Could not revoke invitation.",
        memberError: "Could not update member details.",
        inviteCreated: "Invitation link created",
        inviteCopied: "Invitation link copied to clipboard",
        inviteRevoked: "Invitation revoked",
        memberUpdated: "Staff details updated",
        roleCreated: "Role created",
        roleUpdated: "Role updated",
        roleDeleted: "Role deleted",
        roleError: "Could not manage role.",
        roleRequired: "Enter a role name first.",
        rolePanelTitle: "Restaurant roles",
        rolePanelAction: "Open role management",
        rolePanelSummary: "Review and adjust restaurant roles before sending staff invitations.",
        roleManagerTitle: "Manage roles and permissions",
        roleManagerHint: "Add roles, rename custom roles, and set the default permissions for each role.",
        customRoleTitle: "Create new role",
        roleNameLabel: "Role name",
        roleNamePlaceholder: "e.g. Shift lead",
        createRole: "Add role",
        creatingRole: "Adding...",
        editPermissions: "Permissions",
        deleteRole: "Delete",
        customRoleBadge: "Editable",
        systemRoleBadge: "Default",
        confirmRoleDeleteTitle: "Delete this role?",
        confirmRoleDeleteBody: "Only roles with no assigned staff or pending invitations can be deleted. Default roles will also be removed from this restaurant.",
        confirmRevokeTitle: "Revoke this invitation?",
        confirmRevokeBody: "This link will stop working immediately. The staff member will need a new link to join.",
        confirmMemberTitle: "Confirm staff change?",
        confirmMemberBody: "Role or status changes apply to this staff member's access immediately.",
        confirmAction: "Confirm",
        cancelAction: "Cancel",
        cancelRevokeAction: "Keep invitation",
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
        loadMoreAudit: "Load more history",
        loadingMoreAudit: "Loading...",
        previousAuditPage: "Previous",
        nextAuditPage: "Next page",
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
        flowTitle: "Invitation acceptance steps",
        flow: [
          "Owner or manager sets the role and creates an invitation link.",
          "Staff opens the link to review the restaurant, email, and expiry.",
          "Staff signs in or registers on the same screen if needed.",
          "Accepting the invitation adds the membership and selects the restaurant automatically.",
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
        allowed ? listAuditLogs(restaurantId, AUDIT_PAGE_SIZE) : Promise.resolve({ data: { logs: [], has_more: false } }),
      ]);

      const roleList = (rolesRes?.data?.data ?? []) as Role[];
      const nextInviteRoles = allowedRoleOptions(activeRole, roleList);
      setMembers(membersRes.data.members ?? []);
      setInvitations(invitationsRes.data.invitations ?? []);
      setAuditLogs(logsRes.data.logs ?? []);
      setAuditHasMore(Boolean(logsRes.data.has_more));
      setAuditMobilePage(0);
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
    const loadTimer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, allowed, language]);

  const loadMoreAuditLogs = async () => {
    if (!restaurantId || !allowed || auditLoadingMore || !auditHasMore) return false;
    setAuditLoadingMore(true);
    setError("");
    try {
      const res = await listAuditLogs(restaurantId, AUDIT_PAGE_SIZE, auditLogs.length);
      const nextLogs = res.data.logs ?? [];
      setAuditLogs((current) => {
        const seen = new Set(current.map((log) => log.ID));
        return [...current, ...nextLogs.filter((log) => !seen.has(log.ID))];
      });
      setAuditHasMore(Boolean(res.data.has_more));
      return nextLogs.length > 0;
    } catch {
      setError(copy.loadError);
      return false;
    } finally {
      setAuditLoadingMore(false);
    }
  };

  const goToPreviousAuditPage = () => {
    setAuditMobilePage((current) => Math.max(0, current - 1));
  };

  const goToNextAuditPage = async () => {
    const nextStart = (auditMobilePage + 1) * MOBILE_AUDIT_PAGE_SIZE;
    if (nextStart < auditLogs.length) {
      setAuditMobilePage((current) => current + 1);
      return;
    }
    if (!auditHasMore) return;
    const loaded = await loadMoreAuditLogs();
    if (loaded) {
      setAuditMobilePage((current) => current + 1);
    }
  };

  const openInviteModal = () => {
    setInviteModalClosing(false);
    setInviteModalOpen(true);
  };

  const closeInviteModal = (force = false) => {
    if (!force && (inviteModalClosing || submitting)) return;
    setInviteModalClosing(true);
    window.setTimeout(() => {
      setInviteModalOpen(false);
      setInviteModalClosing(false);
    }, 180);
  };

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
        const createdInvitation = res.data;
        setInvitations((current) => [createdInvitation, ...current]);
        setEmail("");
        try {
          await navigator.clipboard.writeText(inviteUrl(createdInvitation.token));
          setCopiedToken(createdInvitation.token);
          showToast({ title: copy.inviteCopied });
        } catch {
          setCopiedToken("");
          setError(copy.copyError);
          showToast({ title: copy.inviteCreated });
        }
        closeInviteModal(true);
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
      showToast({ title: copy.inviteCopied });
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
    const confirmed = await confirm({
      title: copy.confirmRevokeTitle,
      message: copy.confirmRevokeBody,
      confirmLabel: copy.revoke,
      cancelLabel: copy.cancelRevokeAction,
      tone: "danger",
    });
    if (!confirmed) return;
    revokeLocksRef.current.add(invitationId);
    setRevokingIds((current) => [...current, invitationId]);
    setError("");
    try {
      await revokeInvitation(restaurantId, invitationId);
      setInvitations((current) => current.filter((item) => item.ID !== invitationId));
      showToast({ title: copy.inviteRevoked });
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

  const withRoleAction = async (roleKey: number, action: () => Promise<void>) => {
    if (roleActionIds.includes(roleKey)) return;
    setRoleActionIds((current) => [...current, roleKey]);
    setError("");
    try {
      await action();
    } catch {
      setError(copy.roleError);
    } finally {
      setRoleActionIds((current) => current.filter((id) => id !== roleKey));
    }
  };

  const createCustomRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!allowed || creatingRole) return;
    const displayName = newRoleName.trim();
    if (!displayName) {
      setError(copy.roleRequired);
      return;
    }
    setCreatingRole(true);
    setError("");
    try {
      const res = await createRole({ display_name: displayName, permissions: [] });
      const nextRole = res.data.role;
      setRoles((current) => [...current, nextRole]);
      setRoleId(nextRole.ID);
      setNewRoleName("");
      showToast({ title: copy.roleCreated });
      openRolePermissions(nextRole);
      await refresh();
    } catch {
      setError(copy.roleError);
    } finally {
      setCreatingRole(false);
    }
  };

  const removeRole = async (role: Role) => {
    const confirmed = await confirm({
      title: copy.confirmRoleDeleteTitle,
      message: copy.confirmRoleDeleteBody,
      confirmLabel: copy.deleteRole,
      cancelLabel: copy.cancelAction,
      tone: "danger",
    });
    if (!confirmed) return;
    await withRoleAction(role.ID, async () => {
      await deleteRole(role.ID);
      setRoles((current) => current.filter((item) => item.ID !== role.ID));
      setPermissionTarget((current) => current?.type === "role" && current.role.ID === role.ID ? null : current);
      if (roleId === role.ID) {
        const nextRole = inviteRoles.find((item) => item.ID !== role.ID);
        setRoleId(nextRole?.ID ?? "");
      }
      if (permissionTarget?.type === "role" && permissionTarget.role.ID === role.ID) {
        closePermissionModal(true);
      }
      showToast({ title: copy.roleDeleted });
      await refresh();
    });
  };

  const changeMemberStatus = async (memberId: number, status: MembershipStatus) => {
    if (!restaurantId) return;
    const confirmed = await confirm({
      title: copy.confirmMemberTitle,
      message: copy.confirmMemberBody,
      confirmLabel: copy.confirmAction,
      cancelLabel: copy.cancelAction,
      tone: status === "removed" ? "danger" : "warning",
    });
    if (!confirmed) return;
    await withMemberLock(memberId, async () => {
      const res = await updateMemberStatus(restaurantId, memberId, status);
      setMembers((current) => replaceMember(current, res.data.member));
      showToast({ title: copy.memberUpdated });
      await refresh();
    });
  };

  const changeMemberRole = async (memberId: number, nextRoleId: string) => {
    if (!restaurantId) return;
    const parsed = Number.parseInt(nextRoleId, 10);
    if (!Number.isFinite(parsed)) return;
    const confirmed = await confirm({
      title: copy.confirmMemberTitle,
      message: copy.confirmMemberBody,
      confirmLabel: copy.confirmAction,
      cancelLabel: copy.cancelAction,
      tone: "warning",
    });
    if (!confirmed) return;
    await withMemberLock(memberId, async () => {
      const res = await updateMemberRole(restaurantId, memberId, parsed);
      setMembers((current) => replaceMember(current, res.data.member));
      showToast({ title: copy.memberUpdated });
      await refresh();
    });
  };

  const openRolePermissions = (role: Role) => {
    setPermissionClosing(false);
    setPermissionTarget({ type: "role", role });
    setPermissionDraft(parsePermissions(role.permissions));
    setUseRolePermissions(false);
  };

  const openMemberPermissions = (member: Membership) => {
    setPermissionClosing(false);
    setPermissionTarget({ type: "member", member });
    setPermissionDraft(effectiveMemberPermissions(member));
    setUseRolePermissions(member.permissions_override == null);
  };

  const closePermissionModal = (force = false) => {
    if (!force && (permissionSaving || permissionClosing)) return;
    setPermissionClosing(true);
    window.setTimeout(() => {
      setPermissionTarget(null);
      setPermissionClosing(false);
    }, 180);
  };

  const openRoleManager = () => {
    setRoleManagerClosing(false);
    setRoleManagerOpen(true);
  };

  const closeRoleManager = (force = false) => {
    if (!force && (roleManagerClosing || creatingRole)) return;
    setRoleManagerClosing(true);
    window.setTimeout(() => {
      setRoleManagerOpen(false);
      setRoleManagerClosing(false);
    }, 180);
  };

  const setPermissionRow = (permissions: string[], enabled: boolean) => {
    setPermissionDraft((current) => {
      const next = new Set(current);
      permissions.forEach((permission) => {
        if (enabled) {
          next.add(permission);
        } else {
          next.delete(permission);
        }
      });
      return Array.from(next);
    });
  };

  const savePermissions = async () => {
    if (!permissionTarget || !restaurantId) return;
    setPermissionSaving(true);
    setError("");
    try {
      const permissionsPayload = stripHiddenPermissions(permissionDraft);
      if (permissionTarget.type === "role") {
        const res = await updateRolePermissions(permissionTarget.role.ID, permissionsPayload);
        setRoles((current) => current.map((role) => role.ID === res.data.role.ID ? res.data.role : role));
        setMembers((current) => current.map((member) => member.role_id === res.data.role.ID ? { ...member, role: res.data.role } : member));
      } else {
        const payload = useRolePermissions ? null : permissionsPayload;
        const res = await updateMemberPermissions(restaurantId, permissionTarget.member.ID, payload);
        setMembers((current) => replaceMember(current, res.data.member));
      }
      closePermissionModal(true);
      showToast({ title: language === "th" ? "บันทึกสิทธิ์แล้ว" : "Permissions saved" });
      await refresh();
    } catch {
      setError(copy.memberError);
    } finally {
      setPermissionSaving(false);
    }
  };

  const auditMobileStart = auditMobilePage * MOBILE_AUDIT_PAGE_SIZE;
  const auditMobileLogs = auditLogs.slice(auditMobileStart, auditMobileStart + MOBILE_AUDIT_PAGE_SIZE);
  const auditCanGoBack = auditMobilePage > 0;
  const auditCanGoNext = auditMobileStart + MOBILE_AUDIT_PAGE_SIZE < auditLogs.length || auditHasMore;
  const permissionBackdrop = useBackdropClose(closePermissionModal);
  const roleManagerBackdrop = useBackdropClose(closeRoleManager);
  const inviteModalBackdrop = useBackdropClose(closeInviteModal);

  if (!restaurantId) return null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8 lg:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{copy.eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{copy.subtitle}</p>
        </div>
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

      <div className="space-y-4">
        <section className="space-y-4">
          {allowed && (
            <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">{copy.inviteTitle}</h2>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{copy.inviteHint}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                  <button
                    type="button"
                    onClick={openInviteModal}
                    className="h-10 rounded-md bg-gray-900 px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-gray-900"
                  >
                    {copy.createLink}
                  </button>
                  <button
                    type="button"
                    onClick={openRoleManager}
                    className="h-10 rounded-md border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
                  >
                    {copy.rolePanelAction}
                  </button>
                </div>
              </div>
              <div className="grid border-t border-gray-200 dark:border-gray-800 sm:grid-cols-2 sm:divide-x sm:divide-gray-200 sm:dark:divide-gray-800">
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.rolePanelTitle}</p>
                  <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{copy.rolePanelSummary}</p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-200 border-t border-gray-200 dark:divide-gray-800 dark:border-gray-800 sm:border-t-0">
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.role}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-gray-950 dark:text-white">{allowedRoleOptions(activeRole, roles).length}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.customRoleBadge}</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-gray-950 dark:text-white">
                      {allowedRoleOptions(activeRole, roles).filter(isCustomRole).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  <div className="hidden grid-cols-[minmax(170px,1.35fr)_minmax(150px,1fr)_minmax(76px,0.55fr)_minmax(112px,0.75fr)_minmax(104px,0.85fr)] gap-3 border-b border-gray-100 pb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:border-gray-800 lg:grid">
                    <span>{copy.name}</span>
                    <span>{copy.role}</span>
                    <span>{copy.status}</span>
                    <span>{copy.joined}</span>
                    <span className="text-right">{copy.actions}</span>
                  </div>
                  {members.map((member) => {
                    const manageable = allowed && canManageTarget(activeRole, member.role?.name, member.user_id === user?.ID);
                    const roleOptions = allowedRoleOptions(activeRole, roles);
                    const busy = updatingMemberIds.includes(member.ID);

                    return (
                      <div key={member.ID} className="relative grid gap-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 lg:grid-cols-[minmax(170px,1.35fr)_minmax(150px,1fr)_minmax(76px,0.55fr)_minmax(112px,0.75fr)_minmax(104px,0.85fr)] lg:items-center lg:gap-3 lg:border-0 lg:border-b lg:bg-transparent lg:px-0 lg:py-3 lg:last:border-b-0 lg:dark:bg-transparent">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar src={member.user?.profile_image} name={displayUserName(member, language)} size={40} className="h-10 w-10 text-[12px]" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{displayUserName(member, language)}</p>
                            <p className="truncate text-[11px] text-gray-400">{member.user?.email}</p>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:hidden">{copy.role}</p>
                          {manageable ? (
                            <ThemedSelect
                              className="max-w-full lg:w-full xl:w-[220px]"
                              value={String(member.role_id)}
                              onChange={(next) => void changeMemberRole(member.ID, next)}
                              disabled={busy}
                              options={roleOptions.map((role) => ({
                                value: String(role.ID),
                                label: roleLabel(role, language),
                              }))}
                            />
                          ) : (
                            <div>
                              <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{roleLabel(member.role, language)}</p>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:hidden">{copy.status}</p>
                          <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${statusTone(member.status)}`}>
                            {STATUS_LABELS[language][member.status] ?? member.status}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:hidden">{copy.joined}</p>
                          <p className="text-[12px] leading-5 text-gray-500 dark:text-gray-400">{formatDate(member.joined_at, language)}</p>
                        </div>

                        <div className="min-w-0">
                          {manageable ? (
                            <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
                              <button type="button" onClick={() => openMemberPermissions(member)} disabled={busy} className="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900 xl:col-span-2">
                                {language === "th" ? "สิทธิ์" : "Permissions"}
                              </button>
                              {member.status !== "active" ? (
                                <button type="button" onClick={() => void changeMemberStatus(member.ID, "active")} disabled={busy} className="h-8 min-w-0 rounded-md border border-emerald-200 bg-white px-2 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/50 dark:bg-gray-950 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                                  {copy.restore}
                                </button>
                              ) : (
                                <button type="button" onClick={() => void changeMemberStatus(member.ID, "suspended")} disabled={busy} className="h-8 min-w-0 rounded-md border border-amber-200 bg-white px-2 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/50 dark:bg-gray-950 dark:text-amber-300 dark:hover:bg-amber-900/20">
                                  {copy.suspend}
                                </button>
                              )}
                              <button type="button" onClick={() => void changeMemberStatus(member.ID, "removed")} disabled={busy || member.status === "removed"} className="h-8 min-w-0 rounded-md border border-red-200 bg-white px-2 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20">
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
                  <div className="space-y-3">
                    <div className="space-y-3 sm:hidden">
                      <div className="space-y-2">
                        {auditMobileLogs.map((log) => (
                          <div key={log.ID} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                            <div className="space-y-1.5">
                              <p className="break-words text-[12px] font-medium text-gray-900 dark:text-white">{auditMessage(log, language)}</p>
                              <p className="break-words text-[11px] text-gray-500 dark:text-gray-400">
                                {copy.by} {actorName(log, language)}
                                {log.target_user ? ` · ${copy.target} ${log.target_user.email}` : ""}
                              </p>
                              <p className="text-[10px] text-gray-400">{formatDate(log.CreatedAt, language)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={goToPreviousAuditPage}
                          disabled={!auditCanGoBack}
                          className="h-10 rounded-md border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                        >
                          {copy.previousAuditPage}
                        </button>
                        <button
                          type="button"
                          onClick={() => void goToNextAuditPage()}
                          disabled={!auditCanGoNext || auditLoadingMore}
                          className="h-10 rounded-md border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-45 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                        >
                          {auditLoadingMore ? copy.loadingMoreAudit : copy.nextAuditPage}
                        </button>
                      </div>
                    </div>
                    <div className="hidden max-h-[min(52vh,520px)] overflow-y-auto pr-1 sm:block">
                      <div className="space-y-2">
                        {auditLogs.map((log) => (
                      <div key={log.ID} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-[12px] font-medium text-gray-900 dark:text-white">{auditMessage(log, language)}</p>
                            <p className="mt-0.5 break-words text-[11px] text-gray-500 dark:text-gray-400">
                              {copy.by} {actorName(log, language)}
                              {log.target_user ? ` · ${copy.target} ${log.target_user.email}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-400">{formatDate(log.CreatedAt, language)}</span>
                        </div>
                      </div>
                        ))}
                      </div>
                    </div>
                    {auditHasMore && (
                      <button
                        type="button"
                        onClick={() => void loadMoreAuditLogs()}
                        disabled={auditLoadingMore}
                        className="hidden h-10 w-full rounded-md border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900 sm:block"
                      >
                        {auditLoadingMore ? copy.loadingMoreAudit : copy.loadMoreAudit}
                      </button>
                    )}
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
      </div>

      {inviteModalOpen && (
        <div
          {...inviteModalBackdrop}
          className={`${inviteModalClosing ? "motion-overlay-exit" : "motion-overlay"} fixed left-0 top-0 z-50 flex h-dvh w-dvw items-center justify-center overflow-y-auto bg-gray-950/45 p-3 backdrop-blur-sm sm:p-4`}
        >
          <form
            onSubmit={createInvite}
            className={`${inviteModalClosing ? "motion-dialog-exit" : "motion-dialog"} flex max-h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">{copy.inviteTitle}</h2>
                <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{copy.inviteHint}</p>
              </div>
              <button type="button" onClick={() => closeInviteModal()} className="h-8 w-8 shrink-0 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
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
                      label: roleLabel(role, language),
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
              </div>

              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{copy.flowTitle}</p>
                <ol className="mt-3 space-y-2 text-[12px] leading-5 text-gray-500 dark:text-gray-400">
                  {copy.flow.map((item, index) => (
                    <li key={item} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-[10px] font-semibold tabular-nums text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
              <button
                type="button"
                onClick={() => closeInviteModal()}
                disabled={submitting}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                {copy.cancelAction}
              </button>
              <button type="submit" disabled={!allowed || !roleId || submitting} className="h-10 rounded-md bg-gray-900 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900">
                {submitting ? copy.creating : copy.createLink}
              </button>
            </div>
          </form>
        </div>
      )}

      {roleManagerOpen && (
        <>
          <button
            type="button"
            aria-label={copy.cancelAction}
            {...roleManagerBackdrop}
            className={`${roleManagerClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-40 cursor-default bg-gray-950/45 backdrop-blur-sm`}
          />
          <aside className={`${roleManagerClosing ? "motion-drawer-exit" : "motion-drawer"} fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{copy.rolePanelTitle}</p>
                <h2 className="mt-0.5 text-[15px] font-semibold text-gray-900 dark:text-white">{copy.roleManagerTitle}</h2>
                <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{copy.roleManagerHint}</p>
              </div>
              <button type="button" onClick={() => closeRoleManager()} className="h-8 w-8 shrink-0 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <form onSubmit={(event) => void createCustomRole(event)} className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{copy.customRoleTitle}</p>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[12px] font-medium text-gray-700 dark:text-gray-300">{copy.roleNameLabel}</span>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(event) => setNewRoleName(event.target.value)}
                    placeholder={copy.roleNamePlaceholder}
                    disabled={!allowed || creatingRole}
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-[13px] outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!allowed || creatingRole}
                  className="mt-3 h-10 w-full rounded-md bg-gray-900 px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
                >
                  {creatingRole ? copy.creatingRole : copy.createRole}
                </button>
              </form>

              <div className="mt-4 space-y-2">
                {allowedRoleOptions(activeRole, roles).map((role) => {
                  const busy = roleActionIds.includes(role.ID);
                  const roleCardDisabled = !allowed || busy;

                  return (
                    <div
                      key={role.ID}
                      role="button"
                      tabIndex={roleCardDisabled ? -1 : 0}
                      aria-label={`${copy.editPermissions}: ${roleLabel(role, language)}`}
                      onClick={() => {
                        if (!roleCardDisabled) openRolePermissions(role);
                      }}
                      onKeyDown={(event) => {
                        if (!roleCardDisabled && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          openRolePermissions(role);
                        }
                      }}
                      className={`group/card rounded-md border border-gray-200 bg-white p-2.5 outline-none transition-colors dark:border-gray-800 dark:bg-gray-950 ${
                        roleCardDisabled
                          ? "cursor-not-allowed opacity-70"
                          : "cursor-pointer hover:border-gray-300 hover:bg-gray-50 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 dark:hover:border-gray-700 dark:hover:bg-gray-900"
                      }`}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
                        <div className="min-w-0">
                          <span className="inline-flex max-w-full min-w-0 items-center">
                            <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{roleLabel(role, language)}</span>
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-gray-500 dark:text-gray-400">{permissionSummary(role, language)}</span>
                        </div>
                        <div className="flex shrink-0 items-center justify-center">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition-colors group-hover/card:bg-gray-100 group-hover/card:text-gray-700 dark:group-hover/card:bg-gray-800 dark:group-hover/card:text-gray-200">
                            <ChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </>
      )}

      {permissionTarget && (
        <div {...permissionBackdrop} className={`${permissionClosing ? "motion-overlay-exit" : "motion-overlay"} fixed inset-0 z-50 flex items-stretch justify-center bg-gray-950/45 p-2 backdrop-blur-sm sm:p-4 lg:p-6`}>
          <div className={`${permissionClosing ? "motion-dialog-exit" : "motion-dialog"} flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950`}>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white">
                  {permissionTarget.type === "role"
                    ? `${language === "th" ? "สิทธิ์บทบาท" : "Role permissions"} · ${roleLabel(permissionTarget.role, language)}`
                    : `${language === "th" ? "สิทธิ์พนักงาน" : "Staff permissions"} · ${displayUserName(permissionTarget.member, language)}`}
                </h2>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {permissionTarget.type === "member"
                    ? memberPermissionSummary(permissionTarget.member, language)
                    : permissionSummary(permissionTarget.role, language)}
                </p>
              </div>
              <button type="button" onClick={() => closePermissionModal()} className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {permissionTarget.type === "member" && (
                <label className="mb-3 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={useRolePermissions}
                    onChange={(event) => {
                      setUseRolePermissions(event.target.checked);
                      if (event.target.checked) {
                        setPermissionDraft(parsePermissions(permissionTarget.member.role?.permissions));
                      }
                    }}
                  />
                  {language === "th" ? "ใช้สิทธิ์ตามบทบาทนี้" : "Use this role's default permissions"}
                </label>
              )}
              <div className="mb-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={permissionTarget.type === "member" && useRolePermissions}
                  onClick={() => setPermissionDraft(ALL_PERMISSION_KEYS)}
                  className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  {language === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
                <button
                  type="button"
                  disabled={permissionTarget.type === "member" && useRolePermissions}
                  onClick={() => setPermissionDraft([])}
                  className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  {language === "th" ? "เอาที่เลือกออกทั้งหมด" : "Clear selected"}
                </button>
              </div>
              <div className="space-y-5">
                {PERMISSION_SECTIONS.map((section) => (
                  <section key={section.id} className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
                      <h3 className="text-[15px] font-semibold text-gray-950 dark:text-white">{language === "th" ? section.th : section.en}</h3>
                    </div>
                    <div>
                      {section.rows.map((row) => {
                        const disabled = permissionTarget.type === "member" && useRolePermissions;
                        return (
                          <div key={row.id} className="grid gap-4 border-b border-dashed border-gray-200 px-4 py-4 last:border-b-0 dark:border-gray-800 md:grid-cols-[minmax(0,1fr)_minmax(260px,auto)] md:items-center">
                            <div className="grid gap-1 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5">
                              <p className="text-[13px] font-medium text-gray-900 dark:text-white">{language === "th" ? row.th : row.en}</p>
                              <p className="text-[12px] leading-5 text-gray-500 dark:text-gray-400">{language === "th" ? row.descriptionTh : row.descriptionEn}</p>
                            </div>
                            <div className="flex md:justify-end">
                              {(() => {
                                const checked = row.permissions.every((permission) => permissionDraft.includes(permission));
                                return (
                                  <div className={`inline-flex overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 ${disabled ? "opacity-55" : ""}`}>
                                    <button
                                      type="button"
                                      disabled={disabled}
                                      aria-pressed={!checked}
                                      aria-label={language === "th" ? "ไม่อนุญาต" : "Deny"}
                                      onClick={() => setPermissionRow(row.permissions, false)}
                                      className={`flex h-8 w-9 items-center justify-center text-[15px] font-semibold transition-colors ${
                                        checked
                                          ? "text-red-600 hover:bg-red-50 hover:text-red-700 disabled:hover:bg-transparent disabled:hover:text-red-600 dark:text-red-300 dark:hover:bg-red-950/25 dark:hover:text-red-200"
                                          : "bg-red-600 text-white dark:bg-red-500 dark:text-white"
                                      } disabled:cursor-not-allowed`}
                                    >
                                      ×
                                    </button>
                                    <button
                                      type="button"
                                      disabled={disabled}
                                      aria-pressed={checked}
                                      aria-label={language === "th" ? "อนุญาต" : "Allow"}
                                      onClick={() => setPermissionRow(row.permissions, true)}
                                      className={`flex h-8 w-9 items-center justify-center border-l border-gray-200 text-[14px] font-semibold transition-colors dark:border-gray-800 ${
                                        checked
                                          ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white"
                                          : "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:hover:bg-transparent disabled:hover:text-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-950/25 dark:hover:text-emerald-200"
                                      } disabled:cursor-not-allowed`}
                                    >
                                      ✓
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                {permissionTarget.type === "role" && (
                  <button
                    type="button"
                    onClick={() => void removeRole(permissionTarget.role)}
                    disabled={roleActionIds.includes(permissionTarget.role.ID) || permissionSaving}
                    className="h-9 rounded-md border border-red-200 bg-white px-3 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-950 dark:text-red-300 dark:hover:bg-red-900/20"
                  >
                    {copy.deleteRole}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => void savePermissions()} disabled={permissionSaving} className="h-9 rounded-md bg-gray-900 px-3 text-[12px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-900">
                {permissionSaving ? (language === "th" ? "กำลังบันทึก..." : "Saving...") : (language === "th" ? "บันทึกสิทธิ์" : "Save permissions")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
