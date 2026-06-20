import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api';
import { useAuthStore } from '../store';
import { getErrorMessage } from '../utils';
import {
  ArrowRight, Brain, CheckCircle2, Eye, EyeOff, Lock, Mail,
  ShieldCheck, Sparkles, Workflow, Zap
} from 'lucide-react';
import heroImg from '../assets/hero.png';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      const { token, user } = res.data;
      setAuth(token, user);
      toast.success(`Welcome back, ${user.full_name}`);
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell animate-in">
        <section className="login-hero">
          <div className="login-hero-content">
            <div className="login-kicker"><Sparkles size={14}/> AI-powered audit command centre</div>
            <h1>Audit files that think with your team.</h1>
            <p>
              Specentra AI AuditOS brings engagement files, review notes, sign-offs,
              roll-forwards and workflow locks into one secure workspace built for modern CA firms.
            </p>

            <div className="login-ai-panel">
              <div className="login-ai-panel-head">
                <div><Brain size={18}/></div>
                <span>Specentra AI readiness layer</span>
              </div>
              <div className="login-ai-row">
                <CheckCircle2 size={15}/><span>Maps working papers to structured audit phases</span>
              </div>
              <div className="login-ai-row">
                <CheckCircle2 size={15}/><span>Preserves review trails across file replacements</span>
              </div>
              <div className="login-ai-row">
                <CheckCircle2 size={15}/><span>Prepares clean context for future AI audit assistance</span>
              </div>
            </div>

            <div className="login-hero-grid">
              <div><ShieldCheck size={18}/><span>On-premise control</span></div>
              <div><Workflow size={18}/><span>Sequential audit workflow</span></div>
              <div><Zap size={18}/><span>Fast roll-forward setup</span></div>
            </div>
          </div>

          <div className="login-visual" aria-hidden="true">
            <img src={heroImg} alt="" />
            <div className="login-orbit-card card-one">1000 Preconditions</div>
            <div className="login-orbit-card card-two">AI-ready review trail</div>
            <div className="login-orbit-card card-three">Partner sign-off</div>
          </div>
        </section>

        <div className="login-card">
          <div className="login-logo">
            <div className="logo-mark" style={{ width:46,height:46,fontSize:22 }}>S</div>
            <div>
              <div className="logo-name" style={{ color:'var(--text-primary)', fontSize:20 }}>Specentra</div>
              <div className="logo-sub" style={{ color:'var(--text-muted)' }}>AI AuditOS</div>
            </div>
          </div>

          <div className="login-heading">Welcome back</div>
          <div className="login-sub">Sign in to continue your intelligent audit workflow.</div>

          <form onSubmit={handleLogin} style={{ display:'flex',flexDirection:'column',gap:16 }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <div className="login-input-wrap">
                <Mail size={16}/>
                <input
                  className="input"
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
              <label className="form-label">Password</label>
              <div className="login-input-wrap">
                <Lock size={16}/>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="login-eye-btn" aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Enter AuditOS'} {!loading && <ArrowRight size={16}/>}
            </button>
          </form>

          <div className="login-demo-box">
            <div className="login-demo-title">Demo access</div>
            <div><span>admin@specentra.com</span><strong>Admin@123</strong></div>
            <div><span>partner@specentra.com</span><strong>Partner@123</strong></div>
          </div>

          <p className="login-footnote">
            Secure audit documentation. Smarter review movement. AI-ready by design.
          </p>
        </div>
      </div>
    </div>
  );
}
