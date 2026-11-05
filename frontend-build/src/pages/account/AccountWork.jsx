import { useAuthStore } from '../../store';
import { Link } from 'react-router-dom';
import { Inbox, FolderOpen, MessageSquareWarning, ArrowRight, Sparkles } from 'lucide-react';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Synthetic preview content — typed props, clearly labelled as sample data.
const SAMPLE_TILES = [
  { key: 'review', label: 'Awaiting my review', value: 3, Icon: Inbox, to: '/engagements' },
  { key: 'eng', label: 'Engagements I’m on', value: 5, Icon: FolderOpen, to: '/engagements' },
  { key: 'notes', label: 'Open review notes', value: 2, Icon: MessageSquareWarning, to: '/engagements' },
];
const SAMPLE_ACTIVITY = [
  { when: 'Today', text: 'You finalised WP 3200 — Trade receivables confirmations' },
  { when: 'Yesterday', text: 'You raised a review note on WP 2100 — Revenue cut-off' },
  { when: '2 days ago', text: 'You were assigned as reviewer on Horizon Textiles Pvt Ltd' },
];

export default function AccountWork() {
  const user = useAuthStore((s) => s.user);
  const firstName = (user?.full_name || '').split(' ')[0] || 'there';

  return (
    <div className="account-section">
      <header className="section-head section-head-row">
        <div>
          <h1>{greeting()}, {firstName}</h1>
          <p>A calm summary of what needs you across your engagements.</p>
        </div>
        <span className="pill pill-progress sample-badge"><Sparkles size={12} /> Sample data</span>
      </header>

      <div className="work-tiles">
        {SAMPLE_TILES.map(({ key, label, value, Icon, to }) => (
          <Link key={key} to={to} className="work-tile">
            <div className="work-tile-icon"><Icon size={18} /></div>
            <div className="work-tile-value">{value}</div>
            <div className="work-tile-label">{label}</div>
            <ArrowRight size={15} className="work-tile-arrow" />
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Recent activity</div></div>
        <ul className="work-activity">
          {SAMPLE_ACTIVITY.map((a, i) => (
            <li key={i} className="work-activity-item">
              <span className="work-activity-when">{a.when}</span>
              <span className="work-activity-text">{a.text}</span>
            </li>
          ))}
        </ul>
        <div className="card-foot">
          <span className="muted-note">Preview content — your live personal queue arrives with the review-gate backend.</span>
        </div>
      </div>
    </div>
  );
}
