// src/components/layout/Layout.tsx
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  LayoutDashboard, Users, Plane, BookOpen, Building2,
  LogOut, Wallet, ShieldCheck, FileStack, Bell,
  MessageSquare, ClipboardList, MoreHorizontal
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
    label: 'المسافرون',
    items: [
      { to: '/travellers',    icon: Users,        label: 'المسافرون'       },
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
    ],
  },
]

const mobilePrimaryItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
  { to: '/travellers', icon: Users, label: 'المسافرون' },
  { to: '/trips', icon: Plane, label: 'الرحلات' },
  { to: '/accounting', icon: BookOpen, label: 'المحاسبة' },
]

const mobileMoreItems = [
  { to: '/hotels', icon: Building2, label: 'الفنادق' },
  { to: '/visa-tracking', icon: ShieldCheck, label: 'تتبع التصاريح' },
  { to: '/documents', icon: FileStack, label: 'المستندات' },
  { to: '/reminders', icon: Bell, label: 'التذكيرات وواتساب' },
  { to: '/accounts', icon: Wallet, label: 'الحسابات' },
  { to: '/trip-manifest', icon: ClipboardList, label: 'كشف الرحلة' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="hidden md:flex w-62 bg-emerald-900 text-white flex-col shrink-0" style={{ width: '248px' }}>
        {/* Header */}
        <div className="p-4 border-b border-emerald-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕌</span>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">حملة العمار للحج والعمرة</p>
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] z-40">
        <div className="grid grid-cols-5">
          {mobilePrimaryItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors',
                  isActive ? 'text-emerald-700 font-semibold' : 'text-gray-500'
                )
              }
            >
              <Icon size={18} />
              <span className="leading-none">{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setIsMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-2 text-[11px] text-gray-500 transition-colors"
          >
            <MoreHorizontal size={18} />
            <span className="leading-none">المزيد</span>
          </button>
        </div>
      </nav>

      {/* Mobile more panel */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl p-4 max-h-[75vh] overflow-y-auto shadow-2xl">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700 mb-3">المزيد</p>
            <div className="space-y-1">
              {mobileMoreItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setIsMoreOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                      isActive ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                    )
                  }
                >
                  <Icon size={16} className="shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
