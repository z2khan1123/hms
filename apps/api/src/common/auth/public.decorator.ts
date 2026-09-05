import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of authentication (e.g. login, health check). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
