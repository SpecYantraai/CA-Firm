import { format, formatDistanceToNow } from 'date-fns';

export const formatDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';
export const formatDateTime = (d) => d ? format(new Date(d), 'dd MMM yyyy, HH:mm') : '—';
export const timeAgo = (d) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—';
export const formatBytes = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
};
export const initials = (name) => {
  if (!name) return '?';
  return (name.match(/[A-Za-z0-9]+/g) || [])
    .map(part => (part.length <= 3 && part.toUpperCase() === part) ? part : part[0])
    .join('')
    .slice(0, 20)
    .toUpperCase() || '?';
};
export const statusBadgeClass = (status) => {
  const map = {
    'Draft':'badge badge-navy','Submitted':'badge badge-blue',
    'Under Review':'badge badge-amber','Review Notes Raised':'badge badge-red',
    'Finalised':'badge badge-green','Active':'badge badge-green',
    'Archived':'badge badge-navy','Open':'badge badge-red','Closed':'badge badge-green',
  };
  return map[status] || 'badge badge-navy';
};
export const ENGAGEMENT_TYPES = [
  { value: 'statutory-audit-corporate', label: 'Statutory audit - Corporate' },
  { value: 'statutory-audit-non-corporate', label: 'Statutory audit - Non corporate' },
  { value: 'tax-audit', label: 'Tax audit' },
  { value: 'limited-review', label: 'Limited review' },
  { value: 'certifications', label: 'Certifications' },
  { value: 'other-assurance-related', label: 'Other Assurance engagements / Related services' },
];
export const engagementTypeName = (type) => {
  const map = {
    'statutory-audit': 'Statutory audit - Corporate',
    'internal-audit': 'Other Assurance engagements / Related services',
    ...Object.fromEntries(ENGAGEMENT_TYPES.map(t => [t.value, t.label])),
  };
  return map[type] || type;
};
export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  window.URL.revokeObjectURL(url);
};
export const getErrorMessage = (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'object') return detail?.error || JSON.stringify(detail);
  if (typeof detail === 'string') return detail;
  return err?.message || 'An unexpected error occurred';
};
