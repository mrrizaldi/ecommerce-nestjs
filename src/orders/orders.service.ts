import { Injectable } from '@nestjs/common';

@Injectable()
export class OrdersService {
  list() {
    return [];
  }

  detail(id: string) {
    return { id, status: 'pending' };
  }
}
