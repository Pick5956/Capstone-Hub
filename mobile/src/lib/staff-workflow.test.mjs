import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allowedRoleOptions,
  auditAttribution,
  auditMessage,
  canManageTarget,
  canManageTeam,
  DEFAULT_INVITATION_EXPIRY_DAYS,
  invitationEmailMismatch,
  INVITATION_EXPIRY_DAY_OPTIONS,
  invitationExpiryLabel,
  isInvitationUsableAt,
  invitationTokenFrom,
  roleLabel,
  staffStatusLabel,
  userDisplayName,
} from './staff-workflow.ts';
import { permissionGroupsFor } from './permissions.ts';

function generatedInvitationToken() {
  return Array.from(
    { length: 32 },
    (_, index) => String.fromCodePoint(65 + (index % 26)),
  ).join('');
}

const role = (name, permissions = '[]', id = 1) => ({
  ID: id,
  name,
  display_name: '',
  permissions,
  is_system: true,
});

const membership = (name, permissions, override) => ({
  ID: 1,
  user_id: 10,
  restaurant_id: 20,
  role_id: 1,
  status: 'active',
  joined_at: '2026-07-29T00:00:00Z',
  permissions_override: override,
  role: role(name, permissions),
});

test('staff invitation expiry uses the same safe default and choices as web', () => {
  assert.equal(DEFAULT_INVITATION_EXPIRY_DAYS, 7);
  assert.deepEqual([...INVITATION_EXPIRY_DAY_OPTIONS], [1, 3, 7, 14, 30, 0]);
});

test('team management requires owner or manager hierarchy plus manage_staff', () => {
  assert.equal(canManageTeam(membership('owner', '["*"]')), true);
  assert.equal(canManageTeam(membership('manager', '["manage_staff"]')), true);
  assert.equal(canManageTeam(membership('manager', '["view_dashboard"]')), false);
  assert.equal(canManageTeam(membership('waiter', '["manage_staff"]')), false);
  assert.equal(canManageTeam(membership('manager', '["manage_staff"]', '[]')), false);
  assert.equal(canManageTeam({ ...membership('manager', '["manage_staff"]'), status: 'suspended' }), false);
  assert.equal(canManageTeam(membership('manager', '')), false);
  assert.equal(canManageTeam(membership('manager', '["manage_staff"]', 'not-json')), false);
  assert.equal(canManageTeam(null), false);
});

test('member hierarchy prevents self-management and upward management', () => {
  assert.equal(canManageTarget('owner', 'manager', false), true);
  assert.equal(canManageTarget('owner', 'owner', false), false);
  assert.equal(canManageTarget('manager', 'waiter', false), true);
  assert.equal(canManageTarget('manager', 'manager', false), false);
  assert.equal(canManageTarget('manager', 'waiter', true), false);
  assert.equal(canManageTarget('waiter', 'chef', false), false);
  assert.equal(canManageTarget(undefined, 'chef', false), false);
});

test('assignable roles follow the same hierarchy as the backend', () => {
  const roles = [
    role('owner', '["*"]', 1),
    role('manager', '["manage_staff"]', 2),
    role('waiter', '["take_order"]', 3),
    { ...role('custom_1_shift_lead', '["take_order"]', 4), display_name: 'หัวหน้ากะ', is_system: false },
  ];

  assert.deepEqual(allowedRoleOptions('owner', roles).map((item) => item.name), [
    'manager',
    'waiter',
    'custom_1_shift_lead',
  ]);
  assert.deepEqual(allowedRoleOptions('manager', roles).map((item) => item.name), [
    'waiter',
    'custom_1_shift_lead',
  ]);
  assert.deepEqual(allowedRoleOptions('waiter', roles), []);
});

test('invitation token parsing accepts Dishy links and rejects malformed values', () => {
  const token = generatedInvitationToken();
  assert.equal(token.length, 32);
  assert.equal(invitationTokenFrom(token), token);
  assert.equal(invitationTokenFrom(`https://app.example.com/invitations/${token}/`), token);
  assert.equal(invitationTokenFrom(`dishy://invite/${token}?source=share`), token);
  assert.equal(invitationTokenFrom('https://app.example.com/invitations/not-a-token'), '');
  assert.equal(invitationTokenFrom('%E0%A4%A'), '');
  assert.equal(invitationTokenFrom(''), '');
});

test('email mismatch is case-insensitive and masked public previews stay non-blocking', () => {
  assert.equal(invitationEmailMismatch('staff@example.com', 'STAFF@example.com'), false);
  assert.equal(invitationEmailMismatch('staff@example.com', 'other@example.com'), true);
  assert.equal(invitationEmailMismatch('s***@e***.com', 'other@example.com'), false);
  assert.equal(invitationEmailMismatch('', 'other@example.com'), false);
  assert.equal(invitationEmailMismatch('staff@example.com', ''), false);
});

test('pending invitation links stop being shareable after their expiry time', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  assert.equal(isInvitationUsableAt({ status: 'pending', expires_at: null }, now), true);
  assert.equal(
    isInvitationUsableAt({ status: 'pending', expires_at: '2026-07-29T12:00:01Z' }, now),
    true,
  );
  assert.equal(
    isInvitationUsableAt({ status: 'pending', expires_at: '2026-07-29T12:00:00Z' }, now),
    false,
  );
  assert.equal(
    isInvitationUsableAt({ status: 'accepted', expires_at: '2026-07-30T12:00:00Z' }, now),
    false,
  );
  assert.equal(
    isInvitationUsableAt({ status: 'pending', expires_at: 'not-a-date' }, now),
    false,
  );
});

test('role and audit copy use restaurant language instead of internal role keys', () => {
  assert.equal(roleLabel('waiter'), 'พนักงานเสิร์ฟ');
  assert.equal(roleLabel({ ...role('custom_1_shift_lead'), display_name: 'หัวหน้ากะ' }), 'หัวหน้ากะ');
  assert.equal(roleLabel({ ...role('custom_1_runner'), display_name: '' }), 'custom_1_runner');
  assert.equal(roleLabel(null), 'พนักงาน');
  assert.equal(
    auditMessage({
      ID: 1,
      restaurant_id: 20,
      action: 'member_role_changed',
      details: '{"from_role":"waiter","to_role":"manager"}',
    }),
    'เปลี่ยนบทบาท พนักงานเสิร์ฟ → ผู้จัดการ',
  );
  assert.equal(
    auditMessage({
      ID: 2,
      restaurant_id: 20,
      action: 'invitation_created',
      details: '{"role_name":"chef","email":"cook@example.com"}',
    }),
    'สร้างคำเชิญ ครัว · cook@example.com',
  );
  assert.equal(
    auditMessage({
      ID: 3,
      restaurant_id: 20,
      action: 'invitation_revoked',
      details: '{"email":"cook@example.com"}',
    }),
    'ยกเลิกคำเชิญ · cook@example.com',
  );
  assert.equal(
    auditMessage({
      ID: 4,
      restaurant_id: 20,
      action: 'invitation_accepted',
      details: '{"role_name":"chef"}',
    }),
    'รับคำเชิญเข้าร่วมร้าน เป็น ครัว',
  );
  assert.equal(
    auditMessage({
      ID: 5,
      restaurant_id: 20,
      action: 'member_status_changed',
      details: '{"from_status":"active","to_status":"suspended"}',
    }),
    'เปลี่ยนสถานะสมาชิก ใช้งาน → ระงับ',
  );
  assert.equal(
    auditMessage({
      ID: 6,
      restaurant_id: 20,
      action: 'member_permissions_changed',
      details: '{}',
    }),
    'ปรับสิทธิ์เฉพาะพนักงาน',
  );
  assert.equal(
    auditMessage({
      ID: 7,
      restaurant_id: 20,
      action: 'unknown_action',
      details: 'not-json',
    }),
    'unknown_action',
  );
});

test('role, status, invitation expiry, permission, and audit labels support English', () => {
  assert.equal(roleLabel('waiter', 'en'), 'Waiter');
  assert.equal(roleLabel(null, 'en'), 'Staff');
  assert.equal(staffStatusLabel('suspended', 'en'), 'Suspended');
  assert.equal(invitationExpiryLabel(0, 'en'), 'Never expires');
  assert.equal(invitationExpiryLabel(14, 'en'), '14 days');
  assert.deepEqual(
    permissionGroupsFor('en').map((group) => group.title),
    ['Front of house & payments', 'Kitchen & service', 'Restaurant data'],
  );
  assert.equal(
    permissionGroupsFor('en')[0].rows[0].label,
    'Take orders',
  );
  assert.equal(
    auditMessage({
      ID: 1,
      restaurant_id: 20,
      action: 'member_role_changed',
      details: '{"from_role":"waiter","to_role":"manager"}',
    }, 'en'),
    'Changed role Waiter → Manager',
  );
  assert.equal(
    auditMessage({
      ID: 2,
      restaurant_id: 20,
      action: 'member_status_changed',
      details: '{"from_status":"active","to_status":"suspended"}',
    }, 'en'),
    'Changed member status Active → Suspended',
  );
});

test('audit actor names prefer nickname, then full name, email, and system fallback', () => {
  assert.equal(userDisplayName({ nickname: 'โม', first_name: '', last_name: '', email: 'm@example.com' }), 'โม');
  assert.equal(userDisplayName({ nickname: '', first_name: 'Mali', last_name: 'Dee', email: 'm@example.com' }), 'Mali Dee');
  assert.equal(userDisplayName({ nickname: '', first_name: '', last_name: '', email: 'm@example.com' }), 'm@example.com');
  assert.equal(userDisplayName(undefined), 'ระบบ');
  assert.equal(userDisplayName(undefined, 'en'), 'System');
});

test('audit attribution names the affected member without repeating the actor', () => {
  const actor = {
    ID: 10,
    nickname: 'มะลิ',
    first_name: '',
    last_name: '',
    email: 'manager@example.com',
  };
  const target = {
    ID: 20,
    nickname: '',
    first_name: 'สมชาย',
    last_name: 'ใจดี',
    email: 'staff@example.com',
  };

  assert.equal(
    auditAttribution({
      actor_user_id: actor.ID,
      target_user_id: target.ID,
      actor_user: actor,
      target_user: target,
    }),
    'มะลิ · เป้าหมาย สมชาย ใจดี',
  );
  assert.equal(
    auditAttribution({
      actor_user_id: actor.ID,
      target_user_id: actor.ID,
      actor_user: actor,
      target_user: actor,
    }),
    'มะลิ',
  );
  assert.equal(
    auditAttribution({
      actor_user_id: actor.ID,
      actor_user: actor,
    }),
    'มะลิ',
  );
  assert.equal(
    auditAttribution({
      actor_user_id: actor.ID,
      target_user_id: target.ID,
      actor_user: actor,
      target_user: target,
    }, 'en'),
    'มะลิ · Target: สมชาย ใจดี',
  );
});
