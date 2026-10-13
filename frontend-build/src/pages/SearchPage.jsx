import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '../api';
import { useAppStore } from '../store';
import { statusBadgeClass, formatDate, formatBytes, getErrorMessage } from '../utils';
import { Search, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SearchPage() {
  const navigate = useNavigate();
  const { setCurrentEngagement } = useAppStore();
  const [query, setQuery] = useState('');
  const [wpNumber, setWpNumber] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim() && !wpNumber.trim()) return;
    setLoading(true);
    try {
      const res = await searchApi.search({ q: query || undefined, wp_number: wpNumber || undefined });
      setResults(res.data.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const openEngagement = (eng) => {
    setCurrentEngagement(eng);
    navigate(`/engagements/${eng.engagement_id}`);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Search</h1>
          <p className="page-subtitle">Search across engagements and working papers (FR-056 to FR-058)</p>
        </div>
      </div>

      <div className="page-body">
        {/* Search bar */}
        <div className="card">
          <div className="card-body">
            <form onSubmit={doSearch} style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <div className="searchbar" style={{ flex:2, minWidth:240 }}>
                <Search size={15} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
                <input
                  placeholder="Search by client name, filename, preparer…"
                  value={query} onChange={e => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <input className="input" style={{ flex:1, minWidth:160 }}
                placeholder="WP Number (e.g. 2002.01)"
                value={wpNumber} onChange={e => setWpNumber(e.target.value)}/>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Search size={14}/> {loading ? 'Searching…' : 'Search'}
              </button>
            </form>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:10 }}>
              Results returned in under 3 seconds for up to 40 engagements and 10,000 WPs (NFR-004)
            </div>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Engagements */}
            {results.engagements.length > 0 && (
              <div className="card animate-in">
                <div className="card-header">
                  <span className="card-title">Engagements ({results.engagements.length})</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Client Name</th>
                        <th>Financial Year</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.engagements.map(eng => (
                        <tr key={eng.engagement_id} style={{ cursor:'pointer' }} onClick={() => openEngagement(eng)}>
                          <td><span style={{ fontWeight:600 }}>{eng.client_name}</span></td>
                          <td className="font-mono text-sm">{eng.financial_year}</td>
                          <td><span className={statusBadgeClass(eng.status)}>{eng.status}</span></td>
                          <td className="text-sm text-muted">{formatDate(eng.created_at)}</td>
                          <td>
                            <button className="btn btn-outline btn-xs">Open</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Working Papers */}
            {results.working_papers.length > 0 && (
              <div className="card animate-in">
                <div className="card-header">
                  <span className="card-title">Working Papers ({results.working_papers.length})</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>WP Number</th>
                        <th>Filename</th>
                        <th>Status</th>
                        <th>Prepared By</th>
                        <th>Format</th>
                        <th>Size</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.working_papers.map(wp => (
                        <tr key={wp.wp_id}>
                          <td><span className="wp-number">{wp.wp_number}</span></td>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <FileText size={13} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
                              <span style={{ fontSize:12, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wp.filename}</span>
                            </div>
                          </td>
                          <td><span className={statusBadgeClass(wp.review_status)} style={{ fontSize:10 }}>{wp.review_status}</span></td>
                          <td className="text-sm text-secondary">{wp.prepared_by_name || '—'}</td>
                          <td><span className="badge badge-navy" style={{ fontSize:10 }}>{wp.file_format?.toUpperCase() || '—'}</span></td>
                          <td className="text-sm text-muted">{formatBytes(wp.file_size_bytes)}</td>
                          <td className="text-sm text-muted">{formatDate(wp.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.engagements.length === 0 && results.working_papers.length === 0 && (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon"><Search size={24}/></div>
                  <div className="empty-state-title">No results found</div>
                  <div className="empty-state-sub">Try a different search term or WP number</div>
                </div>
              </div>
            )}
          </div>
        )}

        {!results && !loading && (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><Search size={24}/></div>
              <div className="empty-state-title">Search your audit files</div>
              <div className="empty-state-sub">Search by client name, filename, WP number, or preparer name across all your accessible engagements</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
