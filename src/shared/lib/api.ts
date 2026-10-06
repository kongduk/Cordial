import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// attach access token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("cordial_access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// deduplicated refresh
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const res = await axios.post<{ accessToken: string }>("/api/auth/refresh", {}, { withCredentials: true });
    const token = res.data.accessToken;
    localStorage.setItem("cordial_access_token", token);
    return token;
  } catch (e) {
    console.warn("[api] 토큰 갱신 실패:", (e as Error).message);
    localStorage.removeItem("cordial_access_token");
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshPromise) refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
