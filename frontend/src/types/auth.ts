import { Role } from "./role";

export type Permission = "view_dashboard" | "manage_users" | "edit_post";

export interface User {
  ID: number;
  first_name: string;
  last_name: string;
  birthday: string;
  email: string;
  address: string;
  profile_image: string;
  phone: string;
  role: Role;
}
