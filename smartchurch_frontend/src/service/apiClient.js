// src/api/apiClient.js
import axios from 'axios';

// --- Axios & Token Setup ---
const API_BASE_URL = '/api/';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
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

// --- Video Feed ---
export const getVideoFeedUrl = () => `${apiClient.defaults.baseURL}cv/video/`;


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
  // eslint-disable-next-line no-unused-vars
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

export const generateReport = async (start_date, end_date) => {
  const response = await apiClient.post('/reports/generate-report/', { start_date, end_date });
  return response.data;
};

// Recommendations & Sessions
export const generateFollowUpRecommendations = async (date = null) => {
  const payload = date ? { date } : {};

  const response = await apiClient.post(
    '/reports/generate-followup-recommendations/',
    payload
  );

  return response.data;
};

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

export const getSessionAttendees = async (sessionId) => {
  const response = await apiClient.get('/reports/session-attendees/', { params: { session_id: sessionId } });
  return response.data;
};

export const markMemberPresent = async (sessionId, memberId) => {
  const response = await apiClient.post('/reports/mark-member-present/', { session_id: sessionId, member_id: memberId });
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

// --- CV Attendance Session API ---
export const startSession = async (sessionName) => {
  const res = await apiClient.post('/cv/start/', { session_name: sessionName });
  return res.data;
};

export const stopSession = async () => {
  const res = await apiClient.post('/cv/stop/');
  return res.data;
};

export const getDetectionLogs = async () => {
  const res = await apiClient.get('/cv/logs/');
  return res.data;
};

export const getSessionStatus = async () => {
  const res = await apiClient.get('/cv/status/');
  return res.data;
};

export const getSessionAttendanceResult = async (sessionId) => {
  const res = await apiClient.get(`/cv/session-result/${sessionId}/`);
  return res.data;
};
// --- Validation AI API ---
export const getValidationAiSessions = async () => {
  const response = await apiClient.get('/cv/validation-ai/sessions/');
  return response.data;
};

export const getValidationAiSessionDetail = async (sessionId) => {
  const response = await apiClient.get(`/cv/validation-ai/sessions/${sessionId}/`);
  return response.data;
};

export const getValidationAiMemberGuestData = async (q = '') => {
  const params = q ? { q } : {};
  const response = await apiClient.get('/cv/validation-ai/data-member-guest/', {
    params,
  });
  return response.data;
};

export const verifyValidationAiRecord = async (payload) => {
  const response = await apiClient.post(
    "/cv/validation-ai/actions/verify/",
    payload
  );

  return response.data;
};

export const rejectValidationAiRecord = async (payload) => {
  const response = await apiClient.post(
    "/cv/validation-ai/actions/reject/",
    payload
  );

  return response.data;
};

export const findValidationAiGuestByAi = async (payload) => {
  const response = await apiClient.post(
    "/cv/validation-ai/actions/guest/find-by-ai/",
    payload
  );

  return response.data;
};

export const confirmValidationAiGuest = async (payload) => {
  const response = await apiClient.post(
    "/cv/validation-ai/actions/guest/confirm/",
    payload
  );

  return response.data;
};

export const addValidationAiMemberFace = async (payload) => {
  const response = await apiClient.post(
    "/cv/validation-ai/actions/member/add-face/",
    payload
  );

  return response.data;
};

// --- Validation Registration API ---
export const getRegistrationValidationFaces = async ({
  page = 1,
  pageSize = 20,
  includeEncoding = false,
} = {}) => {
  const response = await apiClient.get('/cv/validation-registration/faces/', {
    params: {
      page,
      page_size: pageSize,
      include_encoding: includeEncoding ? 'true' : 'false',
    },
  });

  return response.data;
};

// Backward compatibility.
// Dipakai GuestValidation untuk ambil summary registration.


export const getRegistrationMemberData = async (q = '') => {
  const params = q ? { q } : {};
  const response = await apiClient.get('/cv/validation-registration/members/', {
    params,
  });
  return response.data;
};

export const addRegistrationMemberFaces = async (payload) => {
  const response = await apiClient.post(
    '/cv/validation-registration/actions/member/add-face/',
    payload
  );
  return response.data;
};

export const rejectRegistrationFaces = async (payload) => {
  const response = await apiClient.post(
    '/cv/validation-registration/actions/reject/',
    payload
  );
  return response.data;
};

export async function openCameraConfigurator() {
  const response = await apiClient.post("/cv/camera-config/open/");
  return response.data;
}

export async function getCameraConfiguratorStatus() {
  const response = await apiClient.get("/cv/camera-config/status/");
  return response.data;
}

export default apiClient;