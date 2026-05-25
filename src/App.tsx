// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/authStore'
import {
  isPathBlockedForCoordinator,
  isPathAllowedForDriver,
  canAccessRoomRequests,
  canAccessStaffPage,
  canAccessBusAssignment,
  canAccessDhabhPage,
} from './lib/permissions'
import Layout from './components/layout/Layout'
import LoginPage           from './pages/LoginPage'
import DashboardPage       from './pages/DashboardPage'
import TravellersPage      from './pages/TravellersPage'
import TravellerProfilePage from './pages/TravellerProfilePage'
import TripsPage           from './pages/TripsPage'
import TripDetailPage      from './pages/TripDetailPage'
import TripManifestPage    from './pages/TripManifestPage'
import AccountingPage      from './pages/AccountingPage'
import AccountsPage        from './pages/AccountsPage'
import HotelsPage          from './pages/HotelsPage'
import RoomsPage           from './pages/RoomsPage'
import VisaTrackingPage    from './pages/VisaTrackingPage'
import DocumentsPage       from './pages/DocumentsPage'
import RemindersPage       from './pages/RemindersPage'
import AdahiPage           from './pages/AdahiPage'
import PilgrimPortalPage   from './pages/PilgrimPortalPage'
import CarUsagePage        from './pages/CarUsagePage'
import NotificationsPage   from './pages/NotificationsPage'
import RoomRequestsPage    from './pages/RoomRequestsPage'
import StaffPage           from './pages/StaffPage'
import BusAssignmentPage   from './pages/BusAssignmentPage'
import DhabhPage           from './pages/DhabhPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 2 } }
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function CoordinatorRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { pathname } = useLocation()
  if (user?.role === 'coordinator' && isPathBlockedForCoordinator(pathname)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

function DriverRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { pathname } = useLocation()
  if (user?.role === 'driver' && !isPathAllowedForDriver(pathname)) {
    return <Navigate to="/cars" replace />
  }
  return <>{children}</>
}

function RoomRequestsRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { pathname } = useLocation()
  if (
    (pathname === '/room-requests' || pathname.startsWith('/room-requests/')) &&
    !canAccessRoomRequests(user?.role)
  ) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { pathname } = useLocation()
  if (
    (pathname === '/staff' || pathname.startsWith('/staff/')) &&
    !canAccessStaffPage(user?.role)
  ) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

function BusesRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { pathname } = useLocation()
  if (
    (pathname === '/buses' || pathname.startsWith('/buses/')) &&
    !canAccessBusAssignment(user?.role)
  ) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

function DhabhRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { pathname } = useLocation()
  if (
    (pathname === '/dhabh' || pathname.startsWith('/dhabh/')) &&
    !canAccessDhabhPage(user?.role)
  ) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

function RoleGuardedOutlet() {
  return (
    <CoordinatorRoute>
      <DriverRoute>
        <RoomRequestsRoute>
          <StaffRoute>
            <BusesRoute>
              <DhabhRoute>
                <Layout />
              </DhabhRoute>
            </BusesRoute>
          </StaffRoute>
        </RoomRequestsRoute>
      </DriverRoute>
    </CoordinatorRoute>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pilgrim" element={<PilgrimPortalPage />} />
          <Route path="/" element={<ProtectedRoute><RoleGuardedOutlet /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"              element={<DashboardPage />} />
            <Route path="travellers"             element={<TravellersPage />} />
            <Route path="travellers/:id"         element={<TravellerProfilePage />} />
            <Route path="trips"                  element={<TripsPage />} />
            <Route path="trips/:id"              element={<TripDetailPage />} />
            <Route path="trip-manifest"          element={<TripManifestPage />} />
            <Route path="accounting"             element={<AccountingPage />} />
            <Route path="accounts"               element={<AccountsPage />} />
            <Route path="hotels"                 element={<HotelsPage />} />
            <Route path="hotels/:hotelId/rooms"  element={<RoomsPage />} />
            <Route path="visa-tracking"          element={<VisaTrackingPage />} />
            <Route path="documents"              element={<DocumentsPage />} />
            <Route path="reminders"              element={<RemindersPage />} />
            <Route path="adahi"                  element={<AdahiPage />} />
            <Route path="cars"                   element={<CarUsagePage />} />
            <Route path="notifications"          element={<NotificationsPage />} />
            <Route path="room-requests"          element={<RoomRequestsPage />} />
            <Route path="buses"                    element={<BusAssignmentPage />} />
            <Route path="dhabh"                    element={<DhabhPage />} />
            <Route path="staff"                   element={<StaffPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
