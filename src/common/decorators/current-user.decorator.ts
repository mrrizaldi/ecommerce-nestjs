import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SanitizedUser } from '../../users/interfaces/sanitized-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SanitizedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
