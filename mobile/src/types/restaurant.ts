import type { User } from './auth';

export interface Role {
  ID: number;
  name: string;
  permissions: string;
}

export interface Restaurant {
  ID: number;
  name: string;
  branch_name: string;
  restaurant_type: string;
  address: string;
  phone: string;
  logo: string;
  open_time: string;
  close_time: string;
  table_count: number;
  service_charge_enabled: boolean;
  service_charge_rate: number;
  vat_enabled: boolean;
  vat_rate: number;
  promptpay_name: string;
  promptpay_qr_image: string;
  owner_id: number;
  owner?: User;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export type MembershipStatus = 'active' | 'suspended' | 'removed';

export interface Membership {
  ID: number;
  user_id: number;
  restaurant_id: number;
  role_id: number;
  status: MembershipStatus;
  joined_at: string;
  invited_by_user_id?: number | null;
  user?: User;
  restaurant?: Restaurant;
  role?: Role;
}
