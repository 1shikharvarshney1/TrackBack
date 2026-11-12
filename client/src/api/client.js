const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('trackback_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('trackback_token', token);
  } else {
    localStorage.removeItem('trackback_token');
  }
}

export function getUser() {
  const user = localStorage.getItem('trackback_user');
  return user ? JSON.parse(user) : null;
}

export function setUser(user) {
  if (user) {
    localStorage.setItem('trackback_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('trackback_user');
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/pdf')) {
    if (!res.ok) throw new Error('PDF generation failed');
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  login: (creds) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(creds) }),
  register: (creds) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(creds) }),
  getMe: () => apiRequest('/auth/me'),

  getCameras: () => apiRequest('/cameras'),
  createCamera: (data) =>
    apiRequest('/cameras', { method: 'POST', body: JSON.stringify(data) }),

  getVideos: () => apiRequest('/videos'),
  uploadVideo: (formData) =>
    apiRequest('/videos/upload', { method: 'POST', body: formData }),

  searchSightings: (plate) =>
    apiRequest(`/sightings/search?plate=${encodeURIComponent(plate)}`),
  getStats: () => apiRequest('/sightings/stats'),
  getSightings: () => apiRequest('/sightings')
};

