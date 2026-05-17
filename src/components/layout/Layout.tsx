// src/components/layout/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  LayoutDashboard, Users, Plane, BookOpen, Building2,
  LogOut, Wallet, ShieldCheck, FileStack, Bell,
  MessageSquare, ClipboardList, Beef, Car
} from 'lucide-react'
import clsx from 'clsx'
import { filterNavSectionsForRole } from '../../lib/permissions'

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
      { to: '/adahi',       icon: Beef,           label: 'الأضاحي'           },
      { to: '/cars',        icon: Car,            label: 'السيارات'          },
    ],
  },
]

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

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const visibleNav = getVisibleNav(user?.role)
  const mobileNavItems = visibleNav.flatMap(section => section.items)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50" dir="rtl">
      {/* Sidebar — desktop only */}
      <aside
        className="hidden md:flex flex-col shrink-0 bg-emerald-900 text-white"
        style={{ width: '248px' }}
      >
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
          {visibleNav.map(section => (
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

      {/* Bottom nav — mobile only */}
      <nav
        className="fixed bottom-0 inset-x-0 md:hidden z-50 bg-emerald-900 border-t border-emerald-800 text-white"
        aria-label="التنقل الرئيسي"
      >
        <div className="flex items-stretch overflow-x-auto">
          {mobileNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 min-w-[4.5rem] px-2 py-2.5 text-[10px] transition-colors',
                  isActive
                    ? 'bg-emerald-700 text-white font-semibold'
                    : 'text-emerald-100 hover:bg-emerald-800'
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate max-w-full text-center leading-tight">{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 min-w-[4.5rem] px-2 py-2.5 text-[10px] text-emerald-100 hover:bg-emerald-800 transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="leading-tight">خروج</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
