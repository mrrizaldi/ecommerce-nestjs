import { JwtSignOptions } from '@nestjs/jwt';

type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

export const parseJwtExpiresIn = (value: string): JwtExpiresIn => {
  if (/^\d+$/u.test(value)) {
    return Number(value);
  }

  if (/^\d+(ms|s|m|h|d|w|y)$/u.test(value)) {
    return value as JwtExpiresIn;
  }

  throw new Error(
    `Invalid JWT expiresIn format "${value}". Use numeric seconds or time suffix (ms|s|m|h|d|w|y).`,
  );
};
