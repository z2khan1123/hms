import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

/**
 * Force an audit record for this route with an explicit action name.
 * Use on PHI **reads** (mutations are audited automatically).
 * e.g. @Audit('patient.read')
 */
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
