import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams, useLocation } from 'react-router-dom'
import { Toast } from '@/components/shared/Toast'
import { PageFallback } from '@/components/shared/PageFallback'
import { PageTransition } from '@/components/shared/PageTransition'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { useSessionGuard } from '@/hooks/useSessionGuard'
import { useSessionRestore } from '@/hooks/useSessionRestore'
import { useAppSocket } from '@/hooks/useAppSocket'
import { useMobileLifecycle } from '@/hooks/useMobileLifecycle'
import { useMenuStore } from '@/stores/menuStore'
import { useCafeStore } from '@/stores/cafeStore'
import { useSessionStore } from '@/stores/sessionStore'
import { readLastTableId } from '@/utils/deviceStorage'
import { prefetchAllCustomerPages } from '@/utils/prefetchRoutes'
import { WelcomePage } from '@/pages/WelcomePage/WelcomePage'

// جاهزية الجلسة المحلية قبل أول رسم (مسار QR → ترحيب بدون spinner)
if (!useSessionStore.getState().hydrated) {
  useSessionStore.getState().hydrate()
}

const MenuPage = lazy(() => import('@/pages/MenuPage/MenuPage').then((m) => ({ default: m.MenuPage })))
const OrderStatusPage = lazy(() =>
  import('@/pages/OrderStatusPage/OrderStatusPage').then((m) => ({ default: m.OrderStatusPage })),
)

function SessionUrlKeeper() {
  const location = useLocation()
  const sessionId = useSessionStore((s) => s.sessionId)
  const tableNumber = useSessionStore((s) => s.tableNumber)
  useEffect(() => {
    if (!sessionId || !tableNumber) return
    try {
      const params = new URLSearchParams(location.search)
      if (params.get('s') === sessionId) return
      params.set('s', sessionId)
      const search = params.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      )
    } catch {
      /* ignore */
    }
  }, [location.pathname, location.search, sessionId, tableNumber])
  return null
}

function knownTableId(): string {
  const fromStore = useSessionStore.getState().tableNumber
  return String(fromStore || readLastTableId() || '').trim()
}

function TableEntry() {
  const { resolveScreen } = useSessionGuard()
  const screen = resolveScreen()
  return (
    <PageTransition transitionKey={screen}>
      {screen === 'menu' ? (
        <Suspense fallback={<PageFallback />}>
          <MenuPage />
        </Suspense>
      ) : (
        <WelcomePage />
      )}
    </PageTransition>
  )
}

function ProtectedOrderStatus() {
  const userName = useSessionStore((s) => s.userName)
  const { tableId } = useParams()
  if (!userName) return <Navigate to={`/${tableId || knownTableId()}`} replace />
  return (
    <Suspense fallback={<PageFallback />}>
      <OrderStatusPage />
    </Suspense>
  )
}

function RootEntry() {
  const table = knownTableId()
  if (table) return <Navigate to={`/${table}`} replace />
  return <WelcomePage />
}

function LegacyRedirect({ suffix }: { suffix?: string }) {
  const table = knownTableId()
  const tail = suffix ? `/${suffix}` : ''
  if (table) return <Navigate to={`/${table}${tail}`} replace />
  return <Navigate to="/" replace />
}

function AppRoutes() {
  const location = useLocation()
  return (
    <PageTransition transitionKey={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<RootEntry />} />
        <Route path="/menu" element={<LegacyRedirect />} />
        <Route path="/order-status" element={<LegacyRedirect suffix="order-status" />} />
        <Route path="/:tableId/order-status" element={<ProtectedOrderStatus />} />
        <Route path="/:tableId" element={<TableEntry />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PageTransition>
  )
}

export function App() {
  const loadCafe = useCafeStore((s) => s.load)
  const loadMenu = useMenuStore((s) => s.load)
  useSessionRestore()

  useMobileLifecycle()
  useAppSocket()

  useEffect(() => {
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
    loadCafe()
    void loadMenu()
    prefetchAllCustomerPages()
  }, [loadCafe, loadMenu])

  return (
    <ErrorBoundary>
      <BrowserRouter basename="/customer">
        <Toast />
        <SessionUrlKeeper />
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
