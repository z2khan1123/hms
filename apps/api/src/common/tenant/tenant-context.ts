import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@hms/shared';

export interface RequestContext {
  tenantId: string | null;
  userId: string | null;
  role: Role | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

export function getUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
