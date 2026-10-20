import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api';
import { useAuthStore } from '../store';
import { getErrorMessage } from '../utils';
import {
  ArrowRight, Eye, EyeOff, Lock, Mail, FileText, ShieldCheck, ChartNoAxesCombined, LoaderCircle, CircleAlert, LayoutGrid, X
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
  const [footerTopic, setFooterTopic] = useState(null);
  const infoDialog = useRef(null);
  useEffect(() => { if (footerTopic) infoDialog.current?.showModal(); }, [footerTopic]);
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
      setError(err.response?.status === 401 ? 'Invalid credentials. Please check and try again.' : getErrorMessage(err));
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
          <div className="signin-brand-caption">AMS &middot; Built for modern CA firms</div>
          <div className="signin-brand-copy">
            <h1>Structured audits.<br/><span>Agents at work.</span><br/>Auditors in control.</h1>
            <div className="signin-practice-list">
              <div><FileText size={18}/><span><strong>Audit task execution</strong><small>Execute audit tasks, analyse evidence, identify exceptions and prepare working papers.</small></span></div>
              <div><ShieldCheck size={18}/><span><strong>Complete engagement visibility</strong><small>Track progress, pending reviews and outstanding work across every engagement.</small></span></div>
              <div><ChartNoAxesCombined size={18}/><span><strong>Professional oversight</strong><small>Keep auditors in control of review, judgement and audit conclusions.</small></span></div>
            </div>
            <p className="signin-brand-tag">Purpose-built for the demands of modern audit practice.</p>
            <div className="signin-brand-footer"><span>Specentra AMS &middot; v2.4.1</span><span>Audit trail enabled</span></div>
          </div>
        </div>
      </section>

      <section className="signin-panel" aria-label="Sign in">
        <ThemeToggle />
        <div className="signin-inner">
          <div className="signin-mobile-brand specentra-wordmark"><b>Spec</b>entra</div>
          <div className="signin-accent" />
          <div className="signin-eyebrow">Secure Sign-in</div>
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
                  placeholder="Enter your password"
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
            <div className="signin-divider"><span>or</span></div>
            <button type="button" className="btn signin-sso" onClick={() => setError('SSO is configured by your firm administrator.')}><LayoutGrid size={16}/>Continue with SSO</button>
          </form>

          {resetPassword && (
            <div className="login-reset-box">
              <div>Temporary password</div>
              <strong>{resetPassword}</strong>
            </div>
          )}

          <footer className="signin-footer">
            <span>&copy; 2026 Specentra. All rights reserved.</span>
            <div className="signin-footer-row"><div className="signin-footer-links">{['Privacy', 'Terms', 'Support'].map(topic => <button type="button" key={topic} onClick={() => setFooterTopic(topic)}>{topic}</button>)}</div><span className="signin-footer-product">AMS-2026-10</span></div>
          </footer>
        </div>
      </section>
      <dialog className="signin-info-dialog" ref={infoDialog} onClose={() => setFooterTopic(null)} aria-labelledby="signin-info-title">
        <div className="modal-header"><h2 id="signin-info-title" className="modal-title">{footerTopic}</h2><button className="btn btn-icon btn-ghost" type="button" title="Close" aria-label="Close" onClick={() => infoDialog.current.close()}><X size={16}/></button></div>
        <div className="modal-body">{footerTopic === 'Support' ? 'Contact your firm administrator for account access and workspace support.' : `Contact your firm administrator for the ${footerTopic?.toLowerCase()} information applicable to this workspace.`}</div>
        <form method="dialog" className="modal-footer"><button className="btn btn-primary">Close</button></form>
      </dialog>
    </div>
  );
}
