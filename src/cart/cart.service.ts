import { Injectable } from '@nestjs/common';

@Injectable()
export class CartService {
  getCart(userId: string) {
    return { userId, items: [] };
  }

  addItem(userId: string) {
    return { userId, added: true };
  }
}
