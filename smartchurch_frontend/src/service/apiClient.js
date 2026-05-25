// src/api/apiClient.js
import axios from 'axios';

// --- Axios & Token Setup ---
const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/',
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let refreshQueue = [];

const flushRefreshQueue = (error, token = null) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  refreshQueue = [];
};

const isAuthEndpoint = (url = '') => url.includes('/token/') || url.includes('token/');
const getFilenameFromDisposition = (disposition = '') => {
  if (!disposition) return null;
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = match?.[1] || match?.[2];
  return raw ? decodeURIComponent(raw) : null;
};

apiClient.interceptors.request.use((config) => {
  if (config.skipAuth) return config;
  // Do not attach expired access token to login/refresh endpoints.
  if (isAuthEndpoint(config.url)) return config;

  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((newAccessToken) => {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      });
    }

    isRefreshing = true;

    try {
      const response = await apiClient.post('/token/refresh/', { refresh: refreshToken }, { skipAuth: true });
      const newAccessToken = response.data.access;
      localStorage.setItem('access_token', newAccessToken);

      flushRefreshQueue(null, newAccessToken);

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      flushRefreshQueue(refreshError, null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// --- Auth ---
export const loginUser = async (credentials) => await apiClient.post('/token/', credentials);

export const getVideoFeedUrl = () => `${apiClient.defaults.baseURL}video_feed/`;


export const downloadFile = async (url, filename = 'download') => {
  if (!url) return;

  try {
    const baseUrl = apiClient.defaults.baseURL || '';
    const isSameOriginAbsolute = url.startsWith(baseUrl);
    const client = url.startsWith('http') && !isSameOriginAbsolute ? axios : apiClient;
    const response = await client.get(url, {
      responseType: 'blob',
      headers: { Accept: '*/*' },
    });

    const contentType = response.headers?.['content-type'] || 'application/octet-stream';
    const disposition = response.headers?.['content-disposition'];
    const resolvedName = getFilenameFromDisposition(disposition) || filename;
    const blob = new Blob([response.data], { type: contentType });
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = resolvedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// --- Members API ---
export const getAllMembers = async () => {
  const response = await apiClient.get('/members/');
  return response.data; 
};
export const createMember = async (payload) => { const response = await apiClient.post('/members/', payload); return response.data; };
export const updateMember = async (id, payload) => await apiClient.put(`/members/${id}/`, payload);
export const deleteMember = async (id) => await apiClient.delete(`/members/${id}/`);
export const addFaceToMember = async (memberId, faceImageUrl) => {
  return await apiClient.post(`/members/${memberId}/add_face/`, { face_image_url: faceImageUrl });
};

// --- Users API ---
export const getAllUsers = async () => {
  const response = await apiClient.get('/manage-users/');
  return response.data;
};
export const createUser = async (payload) => await apiClient.post('/manage-users/', payload);
export const updateUser = async (id, payload) => await apiClient.put(`/manage-users/${id}/`, payload);
export const deleteUser = async (id) => await apiClient.delete(`/manage-users/${id}/`);

// --- Reports API ---
export const getYearlyAttendanceReport = async (year = null) => {
  const params = {};
  if (year) params.year = year;
  const response = await apiClient.get('/reports/yearly-overview/', { params });
  return response.data;
};

export const getSummaryReports = async () => {
  const response = await apiClient.get('/reports/');
  return response.data;
};

export const getReportDetail = async (id) => {
  const response = await apiClient.get(`/reports/${id}/`);
  return response.data;
};

export const generateYearlyReport = async (start_date, end_date) => {
  const response = await apiClient.post('/reports/generate-yearly-report/', { start_date, end_date });
  return response.data;
};

// Recommendations & Sessions
export const getFollowUpRecommendations = async () => {
  const response = await apiClient.get('/reports/follow-up-recommendations/');
  return response.data;
};

export const getGuestConversionRecommendations = async () => {
  const response = await apiClient.get('/reports/guest-conversion-recommendations/');
  return response.data;
};

export const getSessions = async (year = null) => {
  const params = year ? { year } : {};
  const response = await apiClient.get('/reports/sessions/', { params });
  return response.data;
};

export const getSessionAttendees = async (date) => {
  const response = await apiClient.get('/reports/session-attendees/', { params: { date } });
  return response.data;
};

export const updateFollowUpStatus = async (id, data) => {
  const response = await apiClient.patch(`/followup-members/${id}/`, data);
  return response.data;
};

export const updateGuest = async (id, data) => {
  const response = await apiClient.patch(`/guests/${id}/`, data);
  return response.data;
};

// Chat API
export const getConversations = async () => await apiClient.get('/ai-conversations/');
export const getChatThread = async (threadId) => {
  const response = await apiClient.get(`/chat/${threadId}/`, {
    headers: { Accept: 'application/json' },
  });
  return response.data;
};

export const streamChatResponse = async ({ threadId, message }) => {
  const chatPath = `/chat/${threadId ? `${threadId}/` : ''}`;
  return await apiClient.post(chatPath, { message }, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    responseType: 'stream',
    adapter: 'fetch',
  });
};



export default apiClient;