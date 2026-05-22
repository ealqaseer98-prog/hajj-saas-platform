// src/store/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { requestNotificationPermission } from '../lib/firebase'
import type { AppUser } from '../types'

async function registerStaffFcmToken(username: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  const result = await requestNotificationPermission()
  if (result.ok === false) {
    console.warn('[auth] staff FCM registration skipped:', result.reason)
    return
  }

  const { error } = await supabase.from('fcm_tokens').upsert(
    {
      user_type: 'staff',
      username,
      token: result.token,
      device_info: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' }
  )

  if (error) {
    console.error('[auth] fcm_tokens upsert error:', error)
  }
}

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

          if (user.role === 'admin' || user.role === 'coordinator') {
            void registerStaffFcmToken(user.username)
          }

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