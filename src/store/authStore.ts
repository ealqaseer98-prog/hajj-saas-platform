// src/store/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../types'

interface AuthState {
  user:    AppUser | null
  loading: boolean
  login:   (username: string, password: string) => Promise<{ error?: string }>
  logout:  () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:    null,
      loading: false,

      login: async (username, password) => {
        set({ loading: true })
        try {
          // Use Postgres pgcrypto to verify password — never exposes hash to client
          const { data, error } = await supabase
            .rpc('verify_user_login', { p_username: username, p_password: password })

          if (error || !data || data.length === 0) {
            set({ loading: false })
            return { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }
          }

          const user: AppUser = {
            id:        data[0].id,
            username:  data[0].username,
            full_name: data[0].full_name,
            role:      data[0].role,
          }
          set({ user, loading: false })
          return {}
        } catch {
          set({ loading: false })
          return { error: 'حدث خطأ، يرجى المحاولة مجددًا' }
        }
      },

      logout: () => set({ user: null }),
    }),
    { name: 'hajj-auth' }
  )
)