import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { Role } from '@hms/shared';
import { apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { DemoRolePicker } from '../components/DemoRolePicker';
import { demoLoginsEnabled } from '../lib/demo-logins';
import { LANDING_PATH } from '../lib/sections';

type Mode = 'login' | 'register';

/** What the left panel says this system does. Plain claims, all of them true. */
const CAPABILITIES = [
  'Registration, OPD queue, admissions and one bill per episode',
  'Lab and imaging worklists, results released by a clinician',
  'Pharmacy with batch, expiry and allergy checking',
  'Blood bank with enforced ABO and Rh compatibility',
  'Ward, roster, payroll, inventory and the ledgers',
];

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which demo role filled the form, so the choice stays visible. */
  const [pickedRole, setPickedRole] = useState<Role | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tenantName, setTenantName] = useState('');

  if (user) return <Navigate to={LANDING_PATH} replace />;

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
      navigate(LANDING_PATH);
    } catch (err) {
      setError(apiErrorMessage(err, 'Authentication failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      {/* Left: who this is. Collapses away entirely on a phone, where the only
          thing that matters is the form. */}
      <aside className="login-brand">
        <div className="login-brand-top">
          <div className="login-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 21V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14" />
              <path d="M2 21h20" />
              <path d="M12 9v7M8.5 12.5h7" />
            </svg>
          </div>
          <div>
            <div className="login-brand-name">HMS</div>
            <div className="login-brand-sub">Hospital Management System</div>
          </div>
        </div>

        <div className="login-brand-body">
          <h2>One record per patient. One bill per episode.</h2>
          <ul className="login-capabilities">
            {CAPABILITIES.map((c) => (
              <li key={c}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 13 4 4L19 7" />
                </svg>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="login-brand-foot">
          Access is logged. Sign in only with your own account.
        </p>
      </aside>

      {/* Right: the form and, in a demo build, the role shortcuts. */}
      <main className="login-panel">
        <div className="login-form-wrap">
          <header className="login-head">
            <h1>{mode === 'login' ? 'Staff sign in' : 'Create hospital account'}</h1>
            <p className="muted">
              {mode === 'login'
                ? 'Use the account your hospital issued you.'
                : 'Sets up a new hospital and its first administrator.'}
            </p>
          </header>

          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="login-form">
            {mode === 'register' && (
              <>
                <div className="field">
                  <label htmlFor="tenantName">Hospital name</label>
                  <input
                    id="tenantName"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="firstName">First name</label>
                    <input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="lastName">Last name</label>
                    <input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Typing over a filled address means it is no longer that
                  // demo account, so the highlight should stop claiming it is.
                  setPickedRole(null);
                }}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPickedRole(null);
                }}
                required
                minLength={mode === 'register' ? 12 : undefined}
              />
            </div>

            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {mode === 'login' && demoLoginsEnabled && (
            <DemoRolePicker
              selected={pickedRole}
              onSelect={(d) => {
                setEmail(d.email);
                setPassword(d.password);
                setPickedRole(d.role);
                setError(null);
              }}
            />
          )}

          <p className="login-alt">
            {mode === 'login' ? 'Need a new hospital account? ' : 'Already have an account? '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setPickedRole(null);
              }}
            >
              {mode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
