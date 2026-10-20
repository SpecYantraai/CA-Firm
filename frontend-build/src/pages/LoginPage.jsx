import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api';
import { useAuthStore } from '../store';
import { getErrorMessage } from '../utils';
import {
  ArrowRight, Eye, EyeOff, Lock, Mail, FileText, ShieldCheck, ChartNoAxesCombined, LoaderCircle, CircleAlert
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(email, password);
      const { token, user } = res.data;
      setAuth(token, user);
      toast.success(`Welcome back, ${user.full_name}`);
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast.error('Enter your email first');
      return;
    }
    setResetting(true);
    setResetPassword('');
    try {
      const res = await authApi.requestPasswordReset(email);
      const pw = (res.data.message || '').match(/Temporary password: (\S+)/)?.[1] || '';
      setResetPassword(pw);
      toast.success('Temporary password generated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="signin-shell">
      <section className="signin-brand">
        <div className="signin-photo" aria-hidden="true" />
        <div className="signin-brand-content">
          <div className="specentra-wordmark"><b>Spec</b>entra</div>
          <div className="signin-brand-caption">AMS / Built for modern CA firms</div>
          <div className="signin-brand-copy">
            <h1>Structured audits.<br/><span>Connected teams.</span><br/>Auditors in control.</h1>
            <div className="signin-practice-list">
              <div><FileText size={18}/><span>Planning &amp; risk assessment</span></div>
              <div><ShieldCheck size={18}/><span>Execution &amp; evidence</span></div>
              <div><ChartNoAxesCombined size={18}/><span>Review &amp; completion</span></div>
            </div>
            <div className="signin-brand-footer"><span>Specentra AMS</span><span>Audit trail enabled</span></div>
          </div>
        </div>
      </section>

      <section className="signin-panel" aria-label="Sign in">
        <ThemeToggle />
        <div className="signin-inner">
          <div className="signin-mobile-brand specentra-wordmark"><b>Spec</b>entra</div>
          <div className="signin-accent" />
          <div className="signin-eyebrow">Secure sign-in</div>
          <h2 className="signin-heading">Welcome back</h2>
          <p className="signin-sub">Sign in to your AMS workspace to continue.</p>

          <form onSubmit={handleLogin} className="signin-form">
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <div className="login-input-wrap">
                <Mail size={16}/>
                <input
                  className="input"
                  id="email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  placeholder="you@firm.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="login-input-wrap">
                <Lock size={16}/>
                <input
                  className="input"
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="login-eye-btn" title={showPw ? 'Hide password' : 'Show password'} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <button className="login-reset-link" type="button" onClick={handlePasswordReset} disabled={resetting || loading}>
              {resetting ? 'Generating password...' : 'Forgot password?'}
            </button>
            {error && <div className="signin-error" role="alert"><CircleAlert size={16}/><span>{error}</span></div>}
            <button className="btn btn-primary login-submit" type="submit" disabled={loading} aria-busy={loading}>
              {loading && <LoaderCircle size={16} className="spin"/>}
              <span>{loading ? 'Signing in...' : 'Sign in to AMS'}</span> {!loading && <ArrowRight size={16}/>}
            </button>
          </form>

          {resetPassword && (
            <div className="login-reset-box">
              <div>Temporary password</div>
              <strong>{resetPassword}</strong>
            </div>
          )}

          <footer className="signin-footer">
            <span>&copy; {new Date().getFullYear()} Specentra. All rights reserved.</span>
            <span className="signin-footer-product">Audit Management System</span>
          </footer>
        </div>
      </section>
    </div>
  );
}
