
export type Role = "Admin" | "Manager";

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
