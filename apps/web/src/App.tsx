import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/useAuthStore'
import { Toaster } from '@/components/ui/toaster'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { AgentDetailPage } from '@/pages/AgentDetailPage'
import { ApprovalsPage } from '@/pages/ApprovalsPage'
import { AuditPage } from '@/pages/AuditPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { PoliciesPage } from '@/pages/PoliciesPage'

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="agents/:id" element={<AgentDetailPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="policies" element={<PoliciesPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}
