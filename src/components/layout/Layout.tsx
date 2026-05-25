// src/components/layout/Layout.tsx
import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  LayoutDashboard, Users, Plane, BookOpen, Building2,
  LogOut, Wallet, ShieldCheck, FileStack, Bell,
  ClipboardList, Beef, Car, MoreHorizontal, X, MessageSquare, Bus, Landmark,
} from 'lucide-react'
import clsx from 'clsx'
import { filterNavSectionsForRole } from '../../lib/permissions'

type NavItem = {
  to: string
  icon: typeof LayoutDashboard
  label: string
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
      { to: '/staff', icon: Users, label: 'الكادر' },
    ],
  },
  {
    label: 'المسافرون',
    items: [
      { to: '/travellers', icon: Users, label: 'الحجاج' },
      { to: '/visa-tracking', icon: ShieldCheck, label: 'تتبع التصاريح' },
      { to: '/documents', icon: FileStack, label: 'المستندات' },
    ],
  },
  {
    label: 'الرحلات',
    items: [
      { to: '/trips', icon: Plane, label: 'الرحلات' },
      { to: '/trip-manifest', icon: ClipboardList, label: 'كشف الرحلة' },
      { to: '/hotels', icon: Building2, label: 'الفنادق' },
      { to: '/room-requests', icon: MessageSquare, label: 'طلبات الخدمة' },
      { to: '/buses', icon: Bus, label: 'توزيع الباصات' },
      { to: '/dhabh', icon: Landmark, label: 'الذبح' },
    ],
  },
  {
    label: 'المالية',
    items: [
      { to: '/accounting', icon: BookOpen, label: 'المحاسبة' },
      { to: '/accounts', icon: Wallet, label: 'الحسابات' },
      { to: '/reminders', icon: Bell, label: 'التذكيرات وواتساب' },
      { to: '/adahi', icon: Beef, label: 'الأضاحي' },
      { to: '/cars', icon: Car, label: 'السيارات' },
      { to: '/notifications', icon: Bell, label: 'إشعارات الحجاج' },
    ],
  },
]

const MOBILE_PRIMARY_PATHS = ['/dashboard', '/travellers', '/trips', '/hotels'] as const

function getVisibleNav(role: string | undefined) {
  if (role === 'driver') {
    const carsItems = navSections
      .flatMap(section => section.items)
      .filter(item => item.to === '/cars')
    if (carsItems.length === 0) return []
    return [{ label: 'السيارات', items: carsItems }]
  }
  return filterNavSectionsForRole(navSections, role)
}

function navLinkClass(isActive: boolean, compact = false) {
  return clsx(
    compact
      ? 'flex flex-col items-center justify-center gap-0.5 min-w-[4rem] flex-1 px-1 py-2 text-[10px]'
      : 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full',
    'transition-colors',
    isActive
      ? compact
        ? 'text-emerald-300 font-semibold'
        : 'bg-emerald-700 text-white font-semibold'
      : compact
        ? 'text-emerald-100'
        : 'text-emerald-100 hover:bg-emerald-800'
  )
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const visibleNav = getVisibleNav(user?.role)
  const allItems = visibleNav.flatMap(section => section.items)
  const primaryItems = MOBILE_PRIMARY_PATHS.map(path => allItems.find(item => item.to === path)).filter(
    (item): item is NavItem => Boolean(item)
  )
  const moreItems = allItems.filter(
    item => !MOBILE_PRIMARY_PATHS.includes(item.to as (typeof MOBILE_PRIMARY_PATHS)[number])
  )

  const handleLogout = () => {
    setMoreOpen(false)
    logout()
    navigate('/login')
  }

  const closeMore = () => setMoreOpen(false)

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar — desktop only */}
      <aside
        className="hidden md:flex flex-col shrink-0 bg-emerald-900 text-white"
        style={{ width: '248px' }}
      >
        <div className="p-4 border-b border-emerald-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🕌</span>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">نظام إدارة الحج</p>
              <p className="text-emerald-300 text-xs truncate">{user?.full_name ?? user?.username}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {visibleNav.map(section => (
            <div key={section.label}>
              <p className="text-emerald-400 text-xs font-semibold px-3 mb-1 uppercase tracking-wider">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navLinkClass(isActive)}>
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-emerald-800">
          <button
            type="button"
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

      {/* Bottom nav — mobile only */}
      <nav
        className="block md:hidden fixed bottom-0 inset-x-0 z-50 bg-emerald-900 border-t border-emerald-800 text-white"
        aria-label="التنقل الرئيسي"
      >
        <div className="flex items-stretch">
          {primaryItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeMore}
              className={({ isActive }) => navLinkClass(isActive, true)}
            >
              <Icon size={20} className="shrink-0" />
              <span className="truncate max-w-full text-center leading-tight">{label}</span>
            </NavLink>
          ))}
          {moreItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={clsx(
                navLinkClass(moreOpen, true),
                'border-0 bg-transparent cursor-pointer'
              )}
              aria-expanded={moreOpen}
              aria-label="المزيد"
            >
              <MoreHorizontal size={20} className="shrink-0" />
              <span className="leading-tight">المزيد</span>
            </button>
          )}
        </div>
      </nav>

      {/* Slide-up panel — extra nav items (mobile) */}
      {moreOpen && moreItems.length > 0 && (
        <>
          <button
            type="button"
            className="block md:hidden fixed inset-0 z-40 bg-black/40"
            aria-label="إغلاق القائمة"
            onClick={closeMore}
          />
          <div
            className="block md:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="المزيد من القوائم"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-gray-800">المزيد</p>
              <button
                type="button"
                onClick={closeMore}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-2 pb-6">
              {moreItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={closeMore}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm',
                      isActive ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                    )
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm text-red-600 hover:bg-red-50 mt-1"
              >
                <LogOut size={18} />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
