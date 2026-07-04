// src/store/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../types'

interface AuthState {
  user:    AppUser | null
  loading: boolean
  login:   (email: string, password: string) => Promise<{ error?: string }>
  logout:  () => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:    null,
      loading: false,

      login: async (email, password) => {
        set({ loading: true })
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (error || !data.session) {
            set({ loading: false })
            return { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }
          }

          // campaign_id and role are stamped into the JWT by the
          // custom_access_token_hook, available under app_metadata
          const appMeta = data.session.user.app_metadata as {
            campaign_id?: string
            role?: string
          }

          // full_name lives in the profiles table, not the JWT
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', data.session.user.id)
            .single()

          const user: AppUser = {
            id:          data.session.user.id,
            username:    data.session.user.email ?? email,
            full_name:   profile?.full_name ?? data.session.user.email ?? email,
            role:        (appMeta.role as AppUser['role']) ?? 'admin',
            campaign_id: appMeta.campaign_id,
          }

          set({ user, loading: false })
          return {}
        } catch {
          set({ loading: false })
          return { error: 'حدث خطأ، يرجى المحاولة مجددًا' }
        }
      },

      logout: () => {
        supabase.auth.signOut()
        set({ user: null })
      },

      // Called once on app load to re-hydrate the session if the
      // browser still has a valid Supabase Auth session (e.g. after refresh)
      restoreSession: async () => {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          set({ user: null })
          return
        }

        const appMeta = data.session.user.app_metadata as {
          campaign_id?: string
          role?: string
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.session.user.id)
          .single()

        const user: AppUser = {
          id:          data.session.user.id,
          username:    data.session.user.email ?? '',
          full_name:   profile?.full_name ?? data.session.user.email ?? '',
          role:        (appMeta.role as AppUser['role']) ?? 'admin',
          campaign_id: appMeta.campaign_id,
        }

        set({ user })
      },
    }),
    { name: 'hajj-auth', partialize: (state) => ({ user: state.user }) }
  )
)
