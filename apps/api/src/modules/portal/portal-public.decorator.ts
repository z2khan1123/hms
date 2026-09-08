import { SetMetadata } from '@nestjs/common';

export const PORTAL_PUBLIC_KEY = 'portalPublic';

/**
 * A portal route that needs no session — signing in, and redeeming an
 * invitation.
 *
 * Deliberately NOT the staff `@Public()`. The portal controller as a whole is
 * `@Public()` so the staff guards step aside, and if `PortalGuard` read that
 * same flag it would step aside too and leave every route wide open. Two
 * meanings, two decorators.
 */
export const PortalPublic = () => SetMetadata(PORTAL_PUBLIC_KEY, true);
