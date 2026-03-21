import { create } from "zustand"
import { persist } from "zustand/middleware"
import { authApi, setAuthInterceptors } from "@/lib/api"

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: async (email: string, password: string) => {
        const { data } = await authApi.login(email, password)
        set({ token: data.accessToken })
        const { data: user } = await authApi.me()
        set({ user: user as AuthUser })
      },
      logout: () => {
        set({ user: null, token: null })
      },
    }),
    {
      name: "agentos-auth",
      partialize: (state) => ({ user: state.user, token: state.token }),
    },
  ),
)

setAuthInterceptors(
  () => useAuthStore.getState().token,
  () => {
    useAuthStore.getState().logout()
    window.location.href = "/login"
  },
)
