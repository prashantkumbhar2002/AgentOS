import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  headers: { "Content-Type": "application/json" },
})

let getToken: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function setAuthInterceptors(
  tokenGetter: () => string | null,
  unauthorizedHandler: () => void,
) {
  getToken = tokenGetter
  onUnauthorized = unauthorizedHandler
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      onUnauthorized()
    }
    return Promise.reject(error)
  },
)

export default api

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string }>("/api/auth/login", { email, password }),
  me: () => api.get<{ id: string; email: string; name: string; role: string }>("/api/auth/me"),
  refresh: () => api.post<{ accessToken: string }>("/api/auth/refresh"),
}

export const agentsApi = {
  list: (params?: Record<string, unknown>) => api.get("/api/agents", { params }),
  getById: (id: string) => api.get(`/api/agents/${id}`),
  create: (data: Record<string, unknown>) => api.post("/api/agents", data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/agents/${id}`, data),
  updateStatus: (id: string, data: { status: string }) =>
    api.patch(`/api/agents/${id}/status`, data),
  remove: (id: string) => api.delete(`/api/agents/${id}`),
}

export const approvalsApi = {
  list: (params?: Record<string, unknown>) => api.get("/api/approvals", { params }),
  getById: (id: string) => api.get(`/api/approvals/${id}`),
  decide: (id: string, data: { decision: string; comment?: string }) =>
    api.patch(`/api/approvals/${id}/decide`, data),
}

export const auditApi = {
  getLogs: (params?: Record<string, unknown>) => api.get("/api/audit/logs", { params }),
  getTrace: (traceId: string) => api.get(`/api/audit/traces/${traceId}`),
  getStats: (agentId: string) => api.get(`/api/audit/stats/${agentId}`),
  exportCsv: (params?: Record<string, unknown>) =>
    api.get("/api/audit/logs", { params: { ...params, export: "csv" }, responseType: "blob" }),
}

export const policiesApi = {
  list: (params?: Record<string, unknown>) => api.get("/api/policies", { params }),
  getById: (id: string) => api.get(`/api/policies/${id}`),
}

export const analyticsApi = {
  getCosts: (params?: Record<string, unknown>) => api.get("/api/analytics/costs", { params }),
  getCostTimeline: (params?: Record<string, unknown>) =>
    api.get("/api/analytics/costs/timeline", { params }),
  getUsage: (params?: Record<string, unknown>) => api.get("/api/analytics/usage", { params }),
  getAgents: (params?: Record<string, unknown>) => api.get("/api/analytics/agents", { params }),
  getModels: (params?: Record<string, unknown>) => api.get("/api/analytics/models", { params }),
}

export const showcaseApi = {
  runEmailAgent: (data: { task: string }) => api.post("/api/showcase/email-agent/run", data),
  runResearchAgent: (data: { topic: string }) =>
    api.post("/api/showcase/research-agent/run", data),
  seedMock: () => api.post("/api/showcase/mock/seed"),
}
