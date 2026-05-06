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
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single()

          if (error || !data) {
            set({ loading: false })
            return { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }
          }

          const user: AppUser = {
            id:        data.id,
            username:  data.username,
            full_name: data.full_name,
            role:      data.role,
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