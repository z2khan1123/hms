import { apiErrorMessage } from '../lib/api';

/** Renders nothing until there is an error, so callers can drop it in unconditionally. */
export function ErrorNote({
  error,
  fallback,
}: {
  error: unknown;
  fallback?: string;
}) {
  if (!error) return null;
  return (
    <div className="alert" role="alert">
      {apiErrorMessage(error, fallback)}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted" aria-live="polite">
      {label}
    </p>
  );
}
