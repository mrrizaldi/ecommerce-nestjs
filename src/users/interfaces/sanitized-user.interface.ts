import { Address, Cart, Order, Role } from '@prisma/client';

export interface SanitizedUser {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  isActive: boolean;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
  addresses?: Address[];
  carts?: Cart[];
  orders?: Order[];
}
