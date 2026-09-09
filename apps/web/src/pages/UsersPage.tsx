import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROLE_LABELS,
  ROLES,
  type CreateUserInput,
  type RoleMatrix,
  type UserSummary,
  type Role,
} from '@hms/shared';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useCan } from '../lib/permissions';
import { useDebounced } from '../lib/useDebounced';
import { formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

type Tab = 'accounts' | 'roles';

/**
 * Staff accounts, and the permission matrix behind them.
 *
 * The matrix is read-only and comes from the server rather than from the
 * client's copy of the shared package: an administrator should be shown what
 * will actually be enforced, not what a cached bundle believes.
 */
export function UsersPage() {
  const can = useCan();
  const { user: me } = useAuth();
  const canManage = can('user:manage');
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('accounts');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'' | Role>('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(search, 250);

  const users = useQuery({
    queryKey: ['users', debounced, role, includeInactive],
    queryFn: async () => {
      const { data } = await api.get<UserSummary[]>('/users', {
        params: {
          search: debounced || undefined,
          role: role || undefined,
          includeInactive: includeInactive || undefined,
        },
      });
      return data;
    },
  });

  const matrix = useQuery({
    queryKey: ['users', 'role-matrix'],
    queryFn: async () => (await api.get<RoleMatrix>('/users/role-matrix')).data,
    enabled: tab === 'roles',
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(apiErrorMessage(e, 'That did not work')),
  });

  return (
    <section>
      <div className="page-head">
        <h1>Users &amp; roles</h1>
        {canManage && tab === 'accounts' && (
          <button onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : 'Add user'}
          </button>
        )}
      </div>

      <div className="tabs">
        <button
          type="button"
          aria-selected={tab === 'accounts'}
          onClick={() => setTab('accounts')}
        >
          Accounts
        </button>
        <button
          type="button"
          aria-selected={tab === 'roles'}
          onClick={() => setTab('roles')}
        >
          Roles &amp; permissions
        </button>
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      {tab === 'accounts' ? (
        <>
          {adding && canManage && (
            <AddUser
              onDone={(created) => {
                setAdding(false);
                setNotice(
                  `${created.firstName} ${created.lastName} can now sign in as ${created.email}.`,
                );
                refresh();
              }}
              onError={setError}
            />
          )}

          <div className="toolbar">
            <input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Show deactivated
            </label>
          </div>

          <ErrorNote error={users.error} fallback="Could not load users" />
          {users.isPending && <Loading label="Loading users…" />}

          {users.data && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Last signed in</th>
                    <th>Status</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.data.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 6 : 5} className="muted">
                        No users match this filter.
                      </td>
                    </tr>
                  )}
                  {users.data.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isMe={u.id === me?.id}
                      canManage={canManage}
                      busy={act.isPending}
                      onSetRole={(newRole) =>
                        act.mutate(() =>
                          api.patch(`/users/${u.id}`, { role: newRole }),
                        )
                      }
                      onSetActive={(isActive) =>
                        act.mutate(() =>
                          api.post(`/users/${u.id}/active`, { isActive }),
                        )
                      }
                      onResetPassword={(password) =>
                        act.mutate(async () => {
                          await api.post(`/users/${u.id}/password`, { password });
                          setNotice(
                            `Password reset for ${u.email}. Their other sessions have been signed out.`,
                          );
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <RoleMatrixView matrix={matrix.data} pending={matrix.isPending} error={matrix.error} />
      )}
    </section>
  );
}

function UserRow({
  user,
  isMe,
  canManage,
  busy,
  onSetRole,
  onSetActive,
  onResetPassword,
}: {
  user: UserSummary;
  isMe: boolean;
  canManage: boolean;
  busy: boolean;
  onSetRole: (role: Role) => void;
  onSetActive: (isActive: boolean) => void;
  onResetPassword: (password: string) => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <>
      <tr className={user.isActive ? undefined : 'is-dim'}>
        <td>
          {user.firstName} {user.lastName}
          {isMe && <span className="badge" style={{ marginLeft: 8 }}>You</span>}
          {user.staffNo && <div className="muted">{user.staffNo}</div>}
        </td>
        <td>{user.email}</td>
        <td>
          {canManage && !isMe ? (
            <select
              value={user.role}
              disabled={busy || !user.isActive}
              onChange={(e) => onSetRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          ) : (
            ROLE_LABELS[user.role]
          )}
        </td>
        <td className="muted">
          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
        </td>
        <td>
          <span className={`badge ${user.isActive ? 'badge-active' : 'badge-cancelled'}`}>
            {user.isActive ? 'active' : 'deactivated'}
          </span>
        </td>
        {canManage && (
          <td>
            <div className="row-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setResetting((v) => !v)}
              >
                {resetting ? 'Cancel' : 'Reset password'}
              </button>
              {/* Deactivating yourself is refused by the server too; hiding the
                  button here just avoids offering an action that cannot work. */}
              {!isMe && (
                <button
                  type="button"
                  className={user.isActive ? 'secondary' : undefined}
                  disabled={busy}
                  onClick={() => onSetActive(!user.isActive)}
                >
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
      {resetting && canManage && (
        <tr>
          <td colSpan={6}>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                onResetPassword(password);
                setPassword('');
                setResetting(false);
              }}
            >
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <label htmlFor={`pw-${user.id}`}>
                  New password for {user.email}
                </label>
                <input
                  id={`pw-${user.id}`}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button type="submit" disabled={busy}>
                Set password
              </button>
            </form>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
              At least 12 characters. Signs them out everywhere, so tell them
              the new password before you do this.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function AddUser({
  onDone,
  onError,
}: {
  onDone: (user: UserSummary) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<CreateUserInput>({
    email: '',
    firstName: '',
    lastName: '',
    role: 'receptionist',
    password: '',
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<UserSummary>('/users', form)).data,
    onSuccess: onDone,
    onError: (e) => onError(apiErrorMessage(e, 'Could not create the account')),
  });

  const set = <K extends keyof CreateUserInput>(k: K, v: CreateUserInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <h2 style={{ margin: '0 0 14px', fontSize: 15 }}>New staff account</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="nu-first">First name</label>
          <input
            id="nu-first"
            required
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="nu-last">Last name</label>
          <input
            id="nu-last"
            required
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="nu-email">Email</label>
          <input
            id="nu-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="nu-role">Role</label>
          <select
            id="nu-role"
            value={form.role}
            onChange={(e) => set('role', e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="nu-password">Temporary password</label>
        <input
          id="nu-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          At least 12 characters. Give it to them directly and ask them to
          change it — this screen is the only place it exists in the clear.
        </span>
      </div>
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}

/**
 * The permission matrix, read-only.
 *
 * Deliberately not editable. Roles are defined in code and guarded by tests
 * that assert no role can act without the read it depends on — a screen that
 * let someone grant `payment:reverse` to the front desk on a Tuesday would
 * route around all of that. What an administrator needs here is to see what a
 * role can do before assigning it, which is exactly what this gives them.
 */
function RoleMatrixView({
  matrix,
  pending,
  error,
}: {
  matrix: RoleMatrix | undefined;
  pending: boolean;
  error: unknown;
}) {
  const [role, setRole] = useState<Role>('doctor');

  if (pending) return <Loading label="Loading the permission matrix…" />;
  if (error) return <ErrorNote error={error} fallback="Could not load the matrix" />;
  if (!matrix) return null;

  const selected = matrix.roles.find((r) => r.role === role);
  const held = new Set(selected?.permissions ?? []);

  // Grouped by the part before the colon: "patient", "bill", "blood". That is
  // the module, and it is how somebody reads this — "what can a doctor do with
  // billing" rather than "is bill:discount in the list".
  const groups = new Map<string, string[]>();
  for (const p of matrix.permissions) {
    const [area] = p.split(':');
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area)!.push(p);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          Roles are defined in the code and enforced identically by the server
          and this app. They are shown here so you can see what a role can do
          before you assign it; they are not edited from this screen.
        </p>
      </div>

      <div className="toolbar">
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {matrix.roles.map((r) => (
            <option key={r.role} value={r.role}>
              {r.label} — {r.permissions.length} of {matrix.permissions.length}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-row">
        {[...groups.entries()].map(([area, perms]) => {
          const count = perms.filter((p) => held.has(p as never)).length;
          return (
            <div className="panel" key={area}>
              <div className="panel-head">
                <h2>{area}</h2>
                <span className="spacer" />
                <span className="muted" style={{ fontSize: 12 }}>
                  {count}/{perms.length}
                </span>
              </div>
              <div className="panel-body">
                <div className="perm-list">
                  {perms.map((p) => (
                    <span
                      key={p}
                      className={`perm${held.has(p as never) ? ' is-held' : ''}`}
                    >
                      {p.split(':')[1]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
