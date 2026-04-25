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

export type AgentApiKeyResponse = {
  agentId: string
  apiKey: string
  hint: string
  warning: string
}

export const agentsApi = {
  list: (params?: Record<string, unknown>) => api.get("/api/v1/agents", { params }),
  getById: (id: string) => api.get(`/api/v1/agents/${id}`),
  create: (data: Record<string, unknown>) => api.post("/api/v1/agents", data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/v1/agents/${id}`, data),
  updateStatus: (id: string, data: { status: string }) =>
    api.patch(`/api/v1/agents/${id}/status`, data),
  remove: (id: string) => api.delete(`/api/v1/agents/${id}`),
  rotateApiKey: (id: string) =>
    api.post<AgentApiKeyResponse>(`/api/v1/agents/${id}/api-key`),
}

export const approvalsApi = {
  list: (params?: Record<string, unknown>) => api.get("/api/v1/approvals", { params }),
  getById: (id: string) => api.get(`/api/v1/approvals/${id}`),
  decide: (id: string, data: { decision: string; comment?: string }) =>
    api.patch(`/api/v1/approvals/${id}/decide`, data),
}

export const auditApi = {
  getLogs: (params?: Record<string, unknown>) => api.get("/api/v1/audit/logs", { params }),
  getTrace: (traceId: string) => api.get(`/api/v1/audit/traces/${traceId}`),
  getStats: (agentId: string) => api.get(`/api/v1/audit/stats/${agentId}`),
  exportCsv: (params?: Record<string, unknown>) =>
    api.get("/api/v1/audit/logs", { params: { ...params, export: "csv" }, responseType: "blob" }),
}

export const policiesApi = {
  list: (params?: Record<string, unknown>) => api.get("/api/v1/policies", { params }),
  getById: (id: string) => api.get(`/api/v1/policies/${id}`),
}

export const analyticsApi = {
  getCosts: (params?: Record<string, unknown>) => api.get("/api/v1/analytics/costs", { params }),
  getCostTimeline: (params?: Record<string, unknown>) =>
    api.get("/api/v1/analytics/costs/timeline", { params }),
  getUsage: (params?: Record<string, unknown>) => api.get("/api/v1/analytics/usage", { params }),
  getAgents: (params?: Record<string, unknown>) => api.get("/api/v1/analytics/agents", { params }),
  getModels: (params?: Record<string, unknown>) => api.get("/api/v1/analytics/models", { params }),
}

export const showcaseApi = {
  runEmailAgent: (data: { task: string }) => api.post("/api/v1/showcase/email-agent/run", data),
  runResearchAgent: (data: { topic: string }) =>
    api.post("/api/v1/showcase/research-agent/run", data),
  seedMock: () => api.post("/api/v1/showcase/mock/seed"),
}
