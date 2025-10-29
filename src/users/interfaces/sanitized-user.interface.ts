import { Address, Cart, Order } from '@prisma/client';

export interface SanitizedUser {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  addresses?: Address[];
  carts?: Cart[];
  orders?: Order[];
}
