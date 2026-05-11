// src/components/layout/Layout.tsx
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  LayoutDashboard, Users, Plane, BookOpen, Building2,
  LogOut, Wallet, ShieldCheck, FileStack, Bell,
  ClipboardList, Beef, Menu, X,
} from 'lucide-react'
import clsx from 'clsx'

const navSections = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/dashboard',     icon: LayoutDashboard, label: 'لوحة التحكم' },
    ],
  },
  {
    label: 'الحجاج',
    items: [
      { to: '/travellers',    icon: Users,        label: 'الحجاج'       },
      { to: '/visa-tracking', icon: ShieldCheck,  label: 'تتبع التصاريح' },
      { to: '/documents',     icon: FileStack,    label: 'المستندات'       },
    ],
  },
  {
    label: 'الرحلات',
    items: [
      { to: '/trips',          icon: Plane,          label: 'الرحلات'      },
      { to: '/trip-manifest',  icon: ClipboardList,  label: 'كشف الرحلة'   },
      { to: '/hotels',         icon: Building2,      label: 'الفنادق'      },
    ],
  },
  {
    label: 'المالية',
    items: [
      { to: '/accounting',  icon: BookOpen,       label: 'المحاسبة'       },
      { to: '/accounts',    icon: Wallet,         label: 'الحسابات'       },
      { to: '/reminders',   icon: Bell,           label: 'التذكيرات وواتساب' },
      { to: '/adahi',       icon: Beef,           label: 'الأضاحي'           },
    ],
  },
]

const mobileBottomMain: { to: string; icon: typeof LayoutDashboard; label: string }[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
  { to: '/travellers', icon: Users, label: 'الحجاج' },
  { to: '/trips', icon: Plane, label: 'الرحلات' },
  { to: '/accounting', icon: BookOpen, label: 'المحاسبة' },
]

const mobileBottomPaths = new Set(mobileBottomMain.map(i => i.to))

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const moreSections = navSections.map(section => ({
    ...section,
    items: section.items.filter(({ to }) => !mobileBottomPaths.has(to)),
  })).filter(s => s.items.length > 0)

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-62 bg-emerald-900 text-white flex-col shrink-0" style={{ width: '248px' }}>
        {/* Header */}
        <div className="p-4 border-b border-emerald-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕌</span>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">نظام إدارة الحج</p>
              <p className="text-emerald-300 text-xs truncate">{user?.full_name ?? user?.username}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navSections.map(section => (
            <div key={section.label}>
              <p className="text-emerald-400 text-xs font-semibold px-3 mb-1 uppercase tracking-wider">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-emerald-700 text-white font-semibold'
                          : 'text-emerald-100 hover:bg-emerald-800'
                      )
                    }
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-emerald-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-emerald-200 hover:bg-emerald-800 transition-colors"
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 flex md:hidden items-stretch justify-around border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        aria-label="التنقل السريع"
      >
        {mobileBottomMain.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-w-0',
                isActive ? 'text-emerald-700' : 'text-gray-500'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
                <span className="truncate max-w-full px-0.5">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={clsx(
            'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium min-w-0',
            moreOpen ? 'text-emerald-700' : 'text-gray-500'
          )}
        >
          <Menu size={20} className="shrink-0" />
          <span>المزيد</span>
        </button>
      </nav>

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" aria-modal="true" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="إغلاق"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 inset-x-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
              <p className="font-bold text-gray-800">جميع الصفحات</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-3 pb-6 space-y-4">
              {moreSections.map(section => (
                <div key={section.label}>
                  <p className="text-emerald-700 text-xs font-semibold px-2 mb-1">{section.label}</p>
                  <div className="space-y-0.5">
                    {section.items.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm',
                            isActive ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                          )
                        }
                      >
                        <Icon size={18} className="shrink-0 text-emerald-700" />
                        <span>{label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  handleLogout()
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={18} />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
