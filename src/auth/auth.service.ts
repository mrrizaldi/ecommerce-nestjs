import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  login() {
    return { accessToken: 'todo', refreshToken: 'todo' };
  }

  profile(userId: string) {
    return { userId, roles: [] };
  }
}
