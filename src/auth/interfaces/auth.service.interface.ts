import { SanitizedUser } from '../../users/interfaces/sanitized-user.interface';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';

export const AUTH_SERVICE = 'AUTH_SERVICE';

export interface IAuthService {
  register(dto: RegisterDto): Promise<{
    tokenType: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: SanitizedUser;
  }>;
  login(dto: LoginDto): Promise<{
    tokenType: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: SanitizedUser;
  }>;
}
