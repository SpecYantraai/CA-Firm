import axios from 'axios';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const api = axios.create({ baseURL: API_BASE, timeout: 60000 });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('specentra_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((res) => res, (err) => {
  if (err.response?.status === 401) { localStorage.removeItem('specentra_token'); window.location.href = '/login'; }
  return Promise.reject(err);
});
export default api;
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (current_password, new_password) => api.post('/auth/change-password', { current_password, new_password }),
};
export const engApi = {
  list: (params) => api.get('/engagements', { params }),
  get: (id) => api.get(`/engagements/${id}`),
  create: (data) => api.post('/engagements', data),
  archive: (id) => api.patch(`/engagements/${id}/archive`),
  reopen: (id) => api.patch(`/engagements/${id}/reopen`),
  rollforward: (id, data) => api.post(`/engagements/${id}/rollforward`, data),
  toggleWorkflowOverride: (id) => api.patch(`/engagements/${id}/toggle-workflow-override`),
  closureChecklist: (id) => api.get(`/engagements/${id}/closure-checklist`),
  events: (id) => api.get(`/engagements/${id}/events`),
};
export const folderApi = {
  tree: (engagement_id) => api.get(`/engagements/${engagement_id}/folders`),
  create: (engagement_id, data) => api.post(`/engagements/${engagement_id}/folders`, data),
  rename: (folder_id, folder_name) => api.patch(`/folders/${folder_id}`, { folder_name }),
  delete: (folder_id) => api.delete(`/folders/${folder_id}`),
};
export const wpApi = {
  list: (engagement_id, params) => api.get(`/engagements/${engagement_id}/wps`, { params }),
  upload: (engagement_id, formData) => api.post(`/engagements/${engagement_id}/wps`, formData, { headers:{'Content-Type':'multipart/form-data'} }),
  download: (wp_id) => api.get(`/wps/${wp_id}/download`, { responseType:'blob' }),
  preview: (wp_id) => api.get(`/wps/${wp_id}/preview`, { responseType:'blob' }),
  editorConfig: (wp_id) => api.get(`/wps/${wp_id}/editor-config`),
  replace: (wp_id, formData) => api.post(`/wps/${wp_id}/replace`, formData, { headers:{'Content-Type':'multipart/form-data'} }),
  versions: (wp_id) => api.get(`/wps/${wp_id}/versions`),
  downloadVersion: (wp_id, v) => api.get(`/wps/${wp_id}/versions/${v}/download`, { responseType:'blob' }),
  update: (wp_id, data) => api.patch(`/wps/${wp_id}`, data),
  softDelete: (wp_id) => api.delete(`/wps/${wp_id}`),
  submit: (wp_id) => api.post(`/wps/${wp_id}/submit`),
  finalise: (wp_id) => api.post(`/wps/${wp_id}/finalise`),
  getNotes: (wp_id) => api.get(`/wps/${wp_id}/notes`),
  raiseNote: (wp_id, note_text) => api.post(`/wps/${wp_id}/notes`, { note_text }),
  respondNote: (note_id, response_text) => api.patch(`/notes/${note_id}/respond`, { response_text }),
  closeNote: (note_id) => api.patch(`/notes/${note_id}/close`),
  signoff: (wp_id, data) => api.post(`/wps/${wp_id}/signoff`, data),
  links: (wp_id) => api.get(`/wps/${wp_id}/links`),
  createLink: (wp_id, target_wp_number) => api.post(`/wps/${wp_id}/links`, { target_wp_number }),
  deleteLink: (wp_id, link_id) => api.delete(`/wps/${wp_id}/links/${link_id}`),
};
export const userApi = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  deactivate: (user_id) => api.patch(`/users/${user_id}/deactivate`),
  assign: (engagement_id, user_id, role = 'Preparer') => api.post(`/users/${engagement_id}/assign`, { user_id, role }),
  assignments: (engagement_id) => api.get(`/users/${engagement_id}/assignments`),
};
export const searchApi = {
  search: (params) => api.get('/search', { params }),
};
