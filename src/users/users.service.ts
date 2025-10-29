import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  list() {
    return [];
  }

  detail(id: string) {
    return { id, email: 'todo@example.com' };
  }
}
