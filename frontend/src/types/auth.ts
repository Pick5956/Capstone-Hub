export type Permission = string;

export interface User {
  ID: number;
  first_name: string;
  last_name: string;
  nickname: string;
  birthday: string;
  email: string;
  address: string;
  profile_image: string;
  phone: string;
  status?: string;
}
