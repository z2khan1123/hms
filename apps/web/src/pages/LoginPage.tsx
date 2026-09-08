import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@hms/shared';
import { apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { DEMO_LOGINS, demoLoginsEnabled } from '../lib/demo-logins';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which demo role filled the form, so the choice is visible. */
  const [filled, setFilled] = useState<string | null>(null);

  const [email, setEmail] = useState(
    demoLoginsEnabled ? 'admin@demo-hospital.test' : '',
  );
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tenantName, setTenantName] = useState('');

  if (user) return <Navigate to="/patients" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, firstName, lastName, tenantName });
      }
      navigate('/patients');
    } catch (err) {
      setError(apiErrorMessage(err, 'Authentication failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>
          {mode === 'login' ? 'Sign in' : 'Create hospital account'}
        </h1>
        {error && <div className="alert">{error}</div>}
        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label>Hospital name</label>
                <input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Last name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </>
          )}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 12 : undefined}
            />
          </div>
          <button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {mode === 'login' && demoLoginsEnabled && (
          <div className="demo-logins">
            <h2>Demo sign-in</h2>
            <p className="muted">
              Fills the form below. Press Sign in to continue — nothing happens
              until you do.
            </p>
            <div className="demo-login-grid">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  className={filled === d.role ? 'demo-login is-filled' : 'demo-login'}
                  title={d.note}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                    setFilled(d.role);
                    setError(null);
                  }}
                >
                  <span className="demo-login-role">{ROLE_LABELS[d.role]}</span>
                  <span className="muted">{d.note}</span>
                </button>
              ))}
            </div>
            <p className="muted">
              These accounts exist only in the seeded demo hospital, and this
              panel is compiled out of an ordinary production build.
            </p>
          </div>
        )}

        <p className="muted" style={{ marginBottom: 0 }}>
          {mode === 'login' ? 'Need a new hospital account? ' : 'Already have an account? '}
          <button
            className="link"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
