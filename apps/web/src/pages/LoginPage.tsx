import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('admin@demo-hospital.test');
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
