import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { BottomSheet } from '@/components/shared/BottomSheet'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ReceiptDialog } from '@/components/drawer/ReceiptDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { CoordinationDialog } from '@/components/menu/CoordinationDialog'
import { TableUsersDialog } from '@/components/menu/TableUsersDialog'
import { useBillRequest } from '@/hooks/useBillRequest'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { usePeerWaitNotice } from '@/hooks/usePeerWaitNotice'
import { useTableUsers } from '@/hooks/useTableUsers'
import { useTranslation } from '@/hooks/useTranslation'
import {
  beginOrderEdit,
  cancelOrderEdit,
  cancelOrderByCustomer,
  fetchKitchenStatus,
  fetchOrderDetail,
  fetchOrdersForTable,
  fetchSentReceipts,
  replaceOrderItems,
  requestCaptain,
  sendToKitchen,
  setUserStatus,
  syncCartToServer,
  toOrderItems,
} from '@/services/orderService'
import { useCafeStore } from '@/stores/cafeStore'
import { useCartStore } from '@/stores/cartStore'
import { useMenuStore } from '@/stores/menuStore'
import { useOrderStore } from '@/stores/orderStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useTableStore } from '@/stores/tableStore'
import { useToastStore } from '@/stores/toastStore'
import { formatPrice } from '@/utils/formatPrice'
import { ORDER_STATUS_CONFIG } from '@/utils/orderStatusConfig'
import type { Product } from '@/types/menu.types'
import type { OrderStatus } from '@/types/order.types'
import type { SentReceipt } from '@/types/receipt.types'
import { isEligibleForMyOrders, mapApiOrderToStoreOrder, orderToReceipt } from '@/utils/receiptHelpers'
import { dismissOrder, findActiveTableOrder } from '@/utils/orderDismissal'
import { prefetchOrderStatusPage, prefetchWelcomePage } from '@/utils/prefetchRoutes'
import { getOrderStatusToastKeys } from '@/utils/orderStatusToasts'
import { getOrCreateDeviceId } from '@/utils/deviceStorage'
import { isTableOrderingBlocked } from '@/utils/billStatusSync'
import { mapApiItemsToCart } from '@/utils/orderCartHelpers'
import {
  getCoordinationMode,
  hasMultipleTableUsers,
  shouldShowCoordinationDialog,
  type CoordinationMode,
} from '@/utils/sendCoordination'
import styles from './MenuPage.module.css'

export function MenuPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const settings = useCafeStore((s) => s.settings)
  const tableNumber = useSessionStore((s) => s.tableNumber)
  const sessionId = useSessionStore((s) => s.sessionId)
  const clearOrderContext = useSessionStore((s) => s.clearOrderContext)
  const setOrderContext = useSessionStore((s) => s.setOrderContext)
  const customerId = useSessionStore((s) => s.customerId)
  const setAtWelcome = useSessionStore((s) => s.setAtWelcome)
  const touchActive = useSessionStore((s) => s.touchActive)

  const categories = useMenuStore((s) => s.categories)
  const products = useMenuStore((s) => s.products)
  const loading = useMenuStore((s) => s.loading)
  const productsLoading = useMenuStore((s) => s.productsLoading)
  const menuError = useMenuStore((s) => s.error)
  const refreshMenu = useMenuStore((s) => s.refresh)
  const selectedCategory = useMenuStore((s) => s.selectedCategory)
  const setSelectedCategory = useMenuStore((s) => s.setSelectedCategory)
  const loadMenu = useMenuStore((s) => s.load)
  const productsInCategory = useMenuStore((s) => s.productsInCategory)

  const cartItems = useCartStore((s) => s.items)
  const addItem = useCartStore((s) => s.addItem)
  const updateQty = useCartStore((s) => s.updateQty)
  const removeItem = useCartStore((s) => s.removeItem)
  const clearCart = useCartStore((s) => s.clear)
  const setCartItems = useCartStore((s) => s.setItems)
  const cartCount = useCartStore((s) => s.count)
  const cartTotal = useCartStore((s) => s.total)

  const currentOrderId = useOrderStore((s) => s.currentOrderId)
  const currentOrderStatus = useOrderStore((s) => s.currentOrderStatus)
  const statusSheetSignal = useOrderStore((s) => s.statusSheetSignal)
  const addOrder = useOrderStore((s) => s.addOrder)
  const setOrders = useOrderStore((s) => s.setOrders)
  const removeOrder = useOrderStore((s) => s.removeOrder)
  const setCurrentOrder = useOrderStore((s) => s.setCurrentOrder)
  const requestStatusSheet = useOrderStore((s) => s.requestStatusSheet)
  const orders = useOrderStore((s) => s.orders)
  const billRequested = useOrderStore((s) => s.billRequested)

  const activeEmoji = useTableStore((s) => s.activeEmoji)
  const { resolveBillClick, submitBillRequest, refreshBillStatus } = useBillRequest()
  const showToast = useToastStore((s) => s.show)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [myOrdersOpen, setMyOrdersOpen] = useState(false)
  const [statusSheetOpen, setStatusSheetOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [billBlockedOpen, setBillBlockedOpen] = useState(false)
  const [billInfoOpen, setBillInfoOpen] = useState(false)
  const [billConfirmOpen, setBillConfirmOpen] = useState(false)
  const [billConfirmReminder, setBillConfirmReminder] = useState(false)
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [welcomeBlock, setWelcomeBlock] = useState(false)
  const [receiptView, setReceiptView] = useState<SentReceipt | null>(null)
  const [coordinationOpen, setCoordinationOpen] = useState(false)
  const [coordinationMode, setCoordinationMode] = useState<CoordinationMode>('wait_or_alone')
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [cartBump, setCartBump] = useState(false)
  const [flyPayload, setFlyPayload] = useState<{
    key: number
    imageUrl?: string | null
    fromX: number
    fromY: number
    dx: number
    dy: number
  } | null>(null)

  const cartBtnRef = useRef<HTMLButtonElement>(null)
  const productFlyRef = useRef<HTMLDivElement>(null)
  const billFetchedAtRef = useRef(0)
  const prevOrderStatusRef = useRef(currentOrderStatus)
  const lastStatusSignalToastRef = useRef(statusSheetSignal)

  useBodyScrollLock(drawerOpen || cartOpen || usersOpen)

  useEffect(() => {
    if (!currentOrderStatus) {
      prevOrderStatusRef.current = null
      return
    }

    const toastForStatus = () => {
      const keys = getOrderStatusToastKeys(currentOrderStatus)
      if (keys) showToast(t(keys.title), keys.sub ? t(keys.sub) : undefined)
    }

    if (statusSheetSignal > lastStatusSignalToastRef.current) {
      lastStatusSignalToastRef.current = statusSheetSignal
      toastForStatus()
      prevOrderStatusRef.current = currentOrderStatus
      return
    }

    const prev = prevOrderStatusRef.current
    if (prev === null) {
      prevOrderStatusRef.current = currentOrderStatus
      return
    }
    if (prev === currentOrderStatus) return
    toastForStatus()
    prevOrderStatusRef.current = currentOrderStatus
  }, [currentOrderStatus, statusSheetSignal, showToast, t])

  const { users, sendEmoji, refresh: refreshUsers } = useTableUsers()
  usePeerWaitNotice()

  const handleEmojiPick = useCallback(
    (emoji: string, label: string, emojiId?: string) => {
      sendEmoji(emoji, emojiId)
      useTableStore.getState().triggerEmoji({
        sessionId: sessionId || '',
        emoji,
        label,
        at: Date.now(),
      })
      setUsersOpen(false)
    },
    [sendEmoji, sessionId],
  )

  const connectedUsers = useMemo(
    () => users.filter((u) => u.connected !== false),
    [users],
  )

  const showTableFab =
    !usersOpen &&
    !drawerOpen &&
    !cartOpen &&
    !product &&
    !myOrdersOpen &&
    !statusSheetOpen &&
    !coordinationOpen &&
    !closeConfirm &&
    !billConfirmOpen &&
    !billBlockedOpen &&
    !billInfoOpen &&
    !receiptView

  const showEmojiBubble =
    Boolean(activeEmoji) &&
    !usersOpen &&
    !drawerOpen &&
    (showTableFab || activeEmoji?.sessionId !== sessionId)

  const filteredProducts = useMemo(
    () => (selectedCategory ? productsInCategory(selectedCategory) : []),
    [selectedCategory, productsInCategory, products],
  )

  useEffect(() => {
    loadMenu()
    touchActive()
    prefetchOrderStatusPage()
    prefetchWelcomePage()
  }, [loadMenu, touchActive])

  const maybeRefreshBill = useCallback(
    async (force = false) => {
      if (!tableNumber) return
      const now = Date.now()
      if (!force && now - billFetchedAtRef.current < 5000) return
      billFetchedAtRef.current = now
      await refreshBillStatus()
    },
    [tableNumber, refreshBillStatus],
  )

  useEffect(() => {
    void maybeRefreshBill(true)
  }, [tableNumber, maybeRefreshBill])

  useEffect(() => {
    if (!drawerOpen && !cartOpen) return
    void maybeRefreshBill()
  }, [drawerOpen, cartOpen, maybeRefreshBill])

  function notifyTableBillBlocked() {
    showToast(t('table_bill_blocked_send'), t('table_bill_blocked_send_sub'), {
      duration: 8000,
      tone: 'warning',
    })
  }

  async function guardTableCanOrder(): Promise<boolean> {
    await maybeRefreshBill(true)
    if (isTableOrderingBlocked()) {
      notifyTableBillBlocked()
      return false
    }
    return true
  }

  async function applyKitchenStatus(orderId: string) {
    try {
      const status = await fetchKitchenStatus(orderId)
      setCurrentOrder(orderId, status)
      return status
    } catch {
      setCurrentOrder(orderId, 'pending')
      return 'pending' as const
    }
  }

  // نتتبّع آخر قيمة استهلكناها للإشارة حتى لا تُفتح ورقة الحالة تلقائياً
  // عند إعادة تركيب الصفحة (مثل الرجوع عبر زر «التصنيفات») بقيمة إشارة قديمة.
  const lastStatusSignalRef = useRef(statusSheetSignal)
  useEffect(() => {
    if (statusSheetSignal <= 0) return
    if (statusSheetSignal === lastStatusSignalRef.current) return
    lastStatusSignalRef.current = statusSheetSignal
    const orderId = useOrderStore.getState().currentOrderId
    if (!orderId) return
    setStatusSheetOpen(true)
    void applyKitchenStatus(orderId)
  }, [statusSheetSignal, setCurrentOrder])

  useEffect(() => {
    if (!tableNumber || !sessionId) return
    let cancelled = false
    fetchOrdersForTable(tableNumber, sessionId).then((list) => {
      if (cancelled) return
      const visible = list.filter(isEligibleForMyOrders)
      const mapped = visible
        .map((o) => mapApiOrderToStoreOrder(o))
        .filter((o): o is NonNullable<typeof o> => Boolean(o))
      setOrders(mapped)

      const active = findActiveTableOrder(list)
      if (!active?.id) {
        clearOrderContext()
        return
      }
      const oid = String(active.id)
      const customerId = active.customerId != null ? String(active.customerId) : undefined
      setOrderContext(oid, customerId)
      void applyKitchenStatus(oid)
    })
    return () => {
      cancelled = true
    }
  }, [tableNumber, sessionId, setOrderContext, clearOrderContext, setCurrentOrder, setOrders])

  function openProduct(p: Product) {
    setProduct(p)
    setSelectedOptions({})
    setNotes('')
  }

  function handleAddToCart() {
    if (!product || product.isAvailable === false) return

    const origin = productFlyRef.current
    const cart = cartBtnRef.current
    if (origin && cart) {
      const from = origin.getBoundingClientRect()
      const to = cart.getBoundingClientRect()
      const fromX = from.left + from.width / 2
      const fromY = from.top + from.height / 2
      setFlyPayload({
        key: Date.now(),
        imageUrl: product.imageUrl,
        fromX,
        fromY,
        dx: to.left + to.width / 2 - fromX,
        dy: to.top + to.height / 2 - fromY,
      })
      setCartBump(true)
    }

    addItem({
      menuItemId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      options: { ...selectedOptions },
      notes: notes.trim() || undefined,
    })
    setProduct(null)
  }

  async function executeSend(bundleReadyPeers: boolean, opts?: { sendAlone?: boolean }) {
    if (!tableNumber || !sessionId || !cartItems.length || sending) return
    if (!(await guardTableCanOrder())) return
    setSending(true)
    try {
      await syncCartToServer(tableNumber, sessionId, cartItems)
      const data = await sendToKitchen({
        tableId: tableNumber,
        sessionId,
        items: toOrderItems(cartItems),
        bundleReadyPeers,
        sendAlone: opts?.sendAlone,
        deviceId: getOrCreateDeviceId(),
        ...(customerId ? { customerId } : {}),
      })
      const orderId = String(data?.myOrderId || data?.orderId || data?.order?.id || '')
      if (!orderId) {
        showToast('تعذر إرسال الطلب — لم يُرجَع رقم طلب من الخادم')
        return
      }
      const placement = Array.isArray(data?.placements)
        ? data.placements.find((p) => String(p?.sessionId) === sessionId)
        : null
      setOrderContext(orderId, placement?.customerId || customerId)
      addOrder({
        id: orderId,
        tableId: tableNumber,
        items: [...cartItems],
        total: cartTotal(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
      await applyKitchenStatus(orderId)
      requestStatusSheet()
      setStatusSheetOpen(true)
      clearCart()
      setCartOpen(false)
      setCoordinationOpen(false)
    } catch (err) {
      const code = (err as Error & { code?: string }).code
      if (code === 'bill_requested') {
        await refreshBillStatus()
        notifyTableBillBlocked()
        return
      }
      const msg = err instanceof Error ? err.message : 'تعذر إرسال الطلب'
      showToast(msg)
    } finally {
      setSending(false)
    }
  }

  /** من «طلباتي»: افتح ورقة تعديل/إغلاق الطلب — السلة تُفتح لاحقاً من زر التعديل داخل الورقة فقط */
  function openOrderManageSheet(orderId: string, status?: string) {
    const oid = String(orderId || '').trim()
    if (!oid) return
    const fromList = orders.find((o) => o.id === oid)
    const raw = String(status || fromList?.status || currentOrderStatus || 'waiting')
    const st = (['pending', 'waiting', 'preparing', 'ready', 'rejected'].includes(raw)
      ? raw
      : 'waiting') as OrderStatus
    setCurrentOrder(oid, st)
    setMyOrdersOpen(false)
    setStatusSheetOpen(true)
  }

  async function handleEditOrder(orderId?: string) {
    const oid = String(orderId || currentOrderId || '').trim()
    if (!oid || !tableNumber || editBusy) return
    setEditBusy(true)
    try {
      await beginOrderEdit(oid, tableNumber)
      const detail = await fetchOrderDetail(oid, tableNumber)
      const items = mapApiItemsToCart(Array.isArray(detail.items) ? detail.items : [])
      if (!items.length) {
        showToast('لا توجد أصناف قابلة للتعديل في هذا الطلب')
        return
      }
      setEditingOrderId(oid)
      setCartItems(items)
      setStatusSheetOpen(false)
      setMyOrdersOpen(false)
      setCartOpen(true)
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error || '')
          : err instanceof Error
            ? err.message
            : ''
      showToast(msg || 'تعذر فتح تعديل الطلب')
    } finally {
      setEditBusy(false)
    }
  }

  async function handleCartClose() {
    if (editingOrderId && tableNumber) {
      try {
        await cancelOrderEdit(editingOrderId, tableNumber)
      } catch {
        /* ignore */
      }
      setEditingOrderId(null)
      clearCart()
    }
    setCartOpen(false)
  }

  async function executeSaveEdit() {
    const oid = editingOrderId
    if (!oid || !tableNumber || !cartItems.length || sending) return
    if (!(await guardTableCanOrder())) return
    setSending(true)
    try {
      await replaceOrderItems(oid, tableNumber, cartItems)
      setEditingOrderId(null)
      clearCart()
      setCartOpen(false)
      await applyKitchenStatus(oid)
      setStatusSheetOpen(true)
      showToast('تم حفظ التعديل')
    } catch (err) {
      const code = (err as Error & { code?: string }).code
      if (code === 'bill_requested') {
        await refreshBillStatus()
        notifyTableBillBlocked()
        return
      }
      const msg = err instanceof Error ? err.message : ''
      showToast(msg || 'تعذر حفظ التعديل')
    } finally {
      setSending(false)
    }
  }

  async function handleCartSubmit() {
    if (editingOrderId) {
      await executeSaveEdit()
      return
    }
    await handleSendOrder()
  }

  async function handleSendOrder() {
    if (!tableNumber || !sessionId || !cartItems.length || sending) return
    if (!(await guardTableCanOrder())) return
    await refreshUsers()
    const latestUsers = useTableStore.getState().users

    if (!hasMultipleTableUsers(latestUsers)) {
      await executeSend(false)
      return
    }

    if (shouldShowCoordinationDialog(latestUsers, sessionId)) {
      setCoordinationMode(getCoordinationMode(latestUsers, sessionId))
      setCoordinationOpen(true)
      return
    }

    await executeSend(true)
  }

  async function handleCoordinationWait() {
    if (!tableNumber || !sessionId || !cartItems.length) return
    if (!(await guardTableCanOrder())) {
      setCoordinationOpen(false)
      return
    }
    try {
      await syncCartToServer(tableNumber, sessionId, cartItems)
      await setUserStatus(tableNumber, sessionId, 'ready')
      setCoordinationOpen(false)
      setCartOpen(false)
      showToast(t('send_coord_ready'))
      await refreshUsers()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تحديث الحالة'
      showToast(msg)
    }
  }

  async function handleCoordinationSendAlone() {
    await executeSend(false)
  }

  async function handleCoordinationSendBundle() {
    await executeSend(true)
  }

  async function handleBillRequest() {
    setDrawerOpen(false)
    try {
      const action = await resolveBillClick()
      if (action === 'blocked') {
        setBillBlockedOpen(true)
        return
      }
      if (action === 'cooldown') {
        setBillInfoOpen(true)
        return
      }
      if (action === 'reminder') {
        setBillConfirmReminder(true)
        setBillConfirmOpen(true)
        return
      }
      setBillConfirmReminder(false)
      setBillConfirmOpen(true)
    } catch {
      showToast('تعذر التحقق من حالة طلب الحساب')
    }
  }

  async function confirmBillRequest() {
    setBillConfirmOpen(false)
    const isReminder = billConfirmReminder
    setBillConfirmReminder(false)
    try {
      await submitBillRequest()
      showToast(
        isReminder ? t('bill_reminder_title') : t('bill_sent'),
        'سيصل طلبك إلى الكاشير',
      )
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'bill_cooldown') {
        setBillInfoOpen(true)
        return
      }
      showToast('تعذر إرسال طلب الحساب')
    }
  }

  async function handleCaptain() {
    if (!tableNumber || !sessionId) return
    try {
      await requestCaptain(tableNumber, sessionId, `طاولة ${tableNumber}`)
      showToast(t('captain_sent'), 'الكابتن في طريقه إليك')
      setDrawerOpen(false)
    } catch {
      showToast(t('captain_error'))
    }
  }

  async function handleCloseOrder() {
    if (!currentOrderId || !tableNumber) return
    const cancelledId = currentOrderId
    try {
      await cancelOrderByCustomer(cancelledId, tableNumber)
      dismissOrder(cancelledId)
      removeOrder(cancelledId)
      setEditingOrderId(null)
      clearCart()
      clearOrderContext()
      setStatusSheetOpen(false)
      setMyOrdersOpen(false)
      setCloseConfirm(false)
      setDrawerOpen(false)
      touchActive()
      showToast('تم إغلاق الطلب')
    } catch {
      showToast(t('close_order_error'))
    }
  }

  function handleBackToWelcome() {
    if (currentOrderId && currentOrderStatus && !['rejected', 'cancelled'].includes(currentOrderStatus)) {
      setWelcomeBlock(true)
      return
    }
    prefetchWelcomePage()
    startTransition(() => {
      setDrawerOpen(false)
      setAtWelcome(true)
      touchActive()
    })
  }

  async function openReceiptForOrder(orderId: string) {
    if (!tableNumber || !sessionId) return
    const list = await fetchSentReceipts(tableNumber, sessionId)
    const found = list.find((r) => r.id === orderId)
    if (found) {
      setReceiptView(found)
      return
    }
    const local = orders.find((o) => o.id === orderId)
    if (local) {
      setReceiptView(orderToReceipt(local))
    }
  }

  const statusCfg = currentOrderStatus ? ORDER_STATUS_CONFIG[currentOrderStatus] : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <button type="button" className={`${styles.iconBtn} ${styles.menuBtn}`} onClick={() => setDrawerOpen(true)}>
            ☰
          </button>
          <h1 className={styles.cafeName}>{settings.cafeName}</h1>
          <button
            type="button"
            ref={cartBtnRef}
            className={`${styles.iconBtn} ${styles.cartBtn} ${cartBump ? styles.cartBtnBump : ''}`}
            onClick={() => setCartOpen(true)}
          >
            🛒
            <span className={styles.badge}>{cartCount()}</span>
          </button>
        </div>
        <p className={styles.sub}>{t('menu_table_hint', { table: tableNumber || '—' })}</p>
      </header>

      <div className={styles.content}>
        {selectedCategory && (
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => startTransition(() => setSelectedCategory(null))}
          >
            ← {t('categories')}
          </button>
        )}
        <div className={styles.menuViews}>
          <div
            className={`${styles.viewPane} ${selectedCategory ? styles.viewPaneHidden : ''}`}
            aria-hidden={Boolean(selectedCategory)}
          >
            {loading && !categories.length ? (
              <LoadingSpinner />
            ) : menuError && !categories.length ? (
              <div className={styles.loadError}>
                <p>{menuError || t('load_error')}</p>
                <button type="button" className={styles.btnPrimary} onClick={() => void refreshMenu()}>
                  {t('load_retry')}
                </button>
              </div>
            ) : (
              <div className={styles.grid}>
                {categories.map((cat) => (
                  <button
                    key={cat.name}
                    type="button"
                    className={styles.card}
                    onClick={() => startTransition(() => setSelectedCategory(cat.name))}
                  >
                    {cat.imageUrl ? (
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        className={styles.cardImg}
                        loading="eager"
                        decoding="async"
                      />
                    ) : (
                      <div className={styles.cardImg} />
                    )}
                    <div className={styles.cardTitle}>{cat.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className={`${styles.viewPane} ${styles.viewPaneProducts} ${!selectedCategory ? styles.viewPaneHidden : ''}`}
            aria-hidden={!selectedCategory}
          >
            {selectedCategory && productsLoading && !filteredProducts.length ? (
              <LoadingSpinner />
            ) : (
              <div className={styles.grid}>
                {filteredProducts.map((p) => {
                  const unavailable = p.isAvailable === false
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.card} ${unavailable ? styles.cardUnavailable : ''}`}
                      onClick={() => openProduct(p)}
                    >
                      <div className={styles.cardMedia}>
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className={styles.cardImg} loading="lazy" decoding="async" />
                        ) : (
                          <div className={styles.cardImg} />
                        )}
                        {unavailable && <span className={styles.unavailableBadge}>{t('unavailable')}</span>}
                      </div>
                      <div className={styles.cardTitle}>
                        {p.name}
                        <div className={styles.price}>{formatPrice(p.price)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        showTableFab &&
        createPortal(
          <button type="button" className={styles.fab} onClick={() => setUsersOpen(true)}>
            <span>{connectedUsers.length || 1}</span> 👥
          </button>,
          document.body,
        )}

      {typeof document !== 'undefined' &&
        showEmojiBubble &&
        activeEmoji &&
        createPortal(
          <div
            key={`${activeEmoji.sessionId}-${activeEmoji.at}`}
            className={styles.emojiFabBubble}
          >
            <span className={styles.emojiFabBubbleText}>
              {activeEmoji.label || activeEmoji.emoji}
            </span>
            <span className={styles.emojiFabBubbleIcon}>{activeEmoji.emoji}</span>
          </div>,
          document.body,
        )}

      <TableUsersDialog
        open={usersOpen}
        onClose={() => setUsersOpen(false)}
        users={connectedUsers}
        mySessionId={sessionId}
        onPickEmoji={handleEmojiPick}
      />

      {drawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)} />
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerLogo}>
                {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : <span>☕</span>}
              </div>
              <div className={styles.drawerBrand}>{settings.cafeName}</div>
            </div>

            <div className={styles.drawerGroup}>
              <button type="button" className={styles.drawerItem} onClick={() => { setMyOrdersOpen(true); setDrawerOpen(false) }}>
                <span className={styles.drawerText}>
                  <span className={styles.drawerItemTitle}>{t('my_orders')}</span>
                  <span className={styles.drawerItemSub}>{t('my_orders_sub')}</span>
                </span>
                <span className={styles.drawerIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 4h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1V5a1 1 0 0 1 1-1z" />
                    <path d="M9 12h6M9 16h4" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className={styles.drawerItem}
                onClick={() => {
                  prefetchOrderStatusPage()
                  navigate(`/${tableNumber}/order-status`)
                }}
              >
                <span className={styles.drawerText}>
                  <span className={styles.drawerItemTitle}>{t('order_status_nav')}</span>
                  <span className={styles.drawerItemSub}>{t('order_status_sub')}</span>
                </span>
                <span className={styles.drawerIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 18h16" />
                    <path d="M6 18a6 6 0 0 1 12 0" />
                    <path d="M12 6v-2M12 6a2 2 0 0 0-2 2h4a2 2 0 0 0-2-2z" />
                  </svg>
                </span>
              </button>

              <button type="button" className={styles.drawerItem} onClick={handleBillRequest}>
                <span className={styles.drawerText}>
                  <span className={styles.drawerItemTitle}>{t('bill_request')}</span>
                  <span
                    className={`${styles.drawerItemSub} ${billRequested ? styles.drawerItemSubSent : ''}`}
                  >
                    {billRequested ? t('bill_request_sent_sub') : t('bill_request_sub')}
                  </span>
                </span>
                <span className={styles.drawerIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                    <path d="M13 3v5h5M9 13h6M9 17h4" />
                  </svg>
                </span>
              </button>
            </div>

            <div className={styles.drawerDivider} />

            <div className={styles.drawerGroup}>
              <button type="button" className={styles.drawerItem} onClick={handleCaptain}>
                <span className={styles.drawerText}>
                  <span className={styles.drawerItemTitle}>{t('call_captain')}</span>
                  <span className={styles.drawerItemSub}>{t('call_captain_sub')}</span>
                </span>
                <span className={styles.drawerIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 16v-5a6 6 0 0 0-12 0v5l-1.5 2h15L18 16z" />
                    <path d="M10 20a2 2 0 0 0 4 0" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className={styles.drawerItem}
                disabled={Boolean(
                  currentOrderId &&
                    currentOrderStatus &&
                    !['rejected', 'cancelled'].includes(currentOrderStatus),
                )}
                onClick={handleBackToWelcome}
              >
                <span className={styles.drawerText}>
                  <span className={styles.drawerItemTitle}>{t('back_welcome')}</span>
                  <span className={styles.drawerItemSub}>{t('back_welcome_sub')}</span>
                </span>
                <span className={styles.drawerIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 6l-6 6 6 6" />
                  </svg>
                </span>
              </button>
            </div>
          </aside>
        </>
      )}

      {cartOpen && (
        <>
          <div className={styles.cartOverlay} onClick={handleCartClose} aria-hidden />
          <aside className={styles.cartDrawer} role="dialog" aria-modal="true">
            <div className={styles.cartHeader}>
              <div className={styles.cartHeaderIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h2l1.5 11.5a1.5 1.5 0 0 0 1.5 1.3h7.6a1.5 1.5 0 0 0 1.5-1.2L20.5 8H7" />
                  <circle cx="10" cy="20" r="1" />
                  <circle cx="17" cy="20" r="1" />
                </svg>
              </div>
              <div className={styles.cartHeaderText}>
                <h2 className={styles.cartTitle}>{editingOrderId ? t('cart_edit_mode') : t('cart_title')}</h2>
                <p className={styles.cartHeaderSub}>{t('cart_sub')}</p>
              </div>
              <button type="button" className={styles.cartClose} onClick={handleCartClose} aria-label="إغلاق">
                ×
              </button>
            </div>

            {billRequested && (
              <p className={styles.cartBillNotice}>{t('table_bill_blocked_send_sub')}</p>
            )}

            <div className={styles.cartBody}>
              {!cartItems.length ? (
                <EmptyState message={t('cart_empty')} />
              ) : (
                cartItems.map((item) => {
                  const optionEntries = item.options
                    ? Object.entries(item.options).filter(([, v]) => v != null && String(v).trim() !== '')
                    : []
                  return (
                  <div key={item.id} className={styles.cartCard}>
                    <div className={styles.cartCardTop}>
                      <span className={styles.cartCardTotal}>{formatPrice(item.price * item.quantity)}</span>
                      <div className={styles.cartCardInfo}>
                        <div className={styles.cartCardName}>{item.name}</div>
                        <div className={styles.cartCardPrice}>
                          {t('cart_price_label')}: {formatPrice(item.price)}
                        </div>
                      </div>
                    </div>
                    {(optionEntries.length > 0 || item.notes) && (
                      <div className={styles.cartCardMeta}>
                        {optionEntries.map(([label, value]) => (
                          <span key={label} className={styles.cartCardTag}>
                            <span className={styles.cartCardTagLabel}>{label}</span>
                            <span>{Array.isArray(value) ? value.join('، ') : value}</span>
                          </span>
                        ))}
                        {item.notes && (
                          <p className={styles.cartCardNote}>
                            <span className={styles.cartCardNoteLabel}>{t('notes')}:</span> {item.notes}
                          </p>
                        )}
                      </div>
                    )}
                    <div className={styles.cartCardBottom}>
                      <button type="button" className={styles.deleteBtn} onClick={() => removeItem(item.id)}>🗑</button>
                      <div className={styles.qtyCtrl}>
                        <button type="button" onClick={() => updateQty(item.id, -1)}>−</button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => updateQty(item.id, 1)}>+</button>
                      </div>
                    </div>
                  </div>
                  )
                })
              )}
            </div>

            <div className={styles.cartFooter}>
              <div className={styles.cartTotalBlock}>
                <span className={styles.totalLabel}>{t('cart_total')}</span>
                <span className={styles.totalValue}>{formatPrice(cartTotal())}</span>
              </div>
              <button type="button" className={styles.btnOutline} onClick={() => { setCartOpen(false); setSelectedCategory(null) }}>
                {t('cart_add_new')}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={sending || !cartItems.length || billRequested}
                onClick={handleCartSubmit}
              >
                {editingOrderId ? t('cart_save_edit') : t('cart_send')}
              </button>
            </div>
          </aside>
        </>
      )}

      <BottomSheet open={statusSheetOpen && Boolean(currentOrderStatus)} onClose={() => setStatusSheetOpen(false)} title="">
        {statusCfg && (
          <div className={styles.statusSheet}>
            <h3>{statusCfg.label}</h3>
            <p>{statusCfg.sublabel}</p>
            {['pending', 'waiting'].includes(currentOrderStatus || '') && (
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={editBusy}
                onClick={() => handleEditOrder()}
              >
                {t('edit_order')}
              </button>
            )}
            {['pending', 'waiting'].includes(currentOrderStatus || '') && (
              <button type="button" className={styles.btnOutline} onClick={() => setCloseConfirm(true)}>
                {t('close_order')}
              </button>
            )}
            {['preparing', 'ready'].includes(currentOrderStatus || '') && (
              <button type="button" className={styles.btnPrimary} onClick={() => navigate(`/${tableNumber}/order-status`)}>
                {t('order_status_nav')}
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={myOrdersOpen} onClose={() => setMyOrdersOpen(false)} title={t('my_orders')}>
        {!orders.length && !currentOrderId ? (
          <EmptyState message={t('no_orders')} />
        ) : (
          orders.map((o, i) => (
            <div key={o.id} className={styles.orderCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`${styles.statusBadge} ${o.status === 'ready' ? styles.statusBadgeDone : ''}`}>
                  {o.status === 'ready' ? '✅ مكتمل' : `⏱ ${ORDER_STATUS_CONFIG[o.status]?.label || o.status}`}
                </span>
                <strong>الطلب {i + 1 === 1 ? 'الأول' : `#${i + 1}`}</strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 8 }}>
                يمكنك مراجعة التفاصيل من الوصل.
              </p>
              <div style={{ fontWeight: 800, color: 'var(--color-primary)', marginTop: 8 }}>{formatPrice(o.total)}</div>
              <div className={styles.orderActions}>
                {['pending', 'waiting'].includes(o.status) && (
                  <button
                    type="button"
                    className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                    onClick={() => openOrderManageSheet(o.id, o.status)}
                  >
                    {t('edit_order')}
                  </button>
                )}
                <button type="button" className={styles.smallBtn} onClick={() => openReceiptForOrder(o.id)}>
                  {t('view_receipt')}
                </button>
              </div>
            </div>
          ))
        )}
      </BottomSheet>

      {flyPayload && (
        <div
          key={flyPayload.key}
          className={styles.flyToCart}
          style={
            {
              left: flyPayload.fromX,
              top: flyPayload.fromY,
              '--fly-dx': `${flyPayload.dx}px`,
              '--fly-dy': `${flyPayload.dy}px`,
            } as React.CSSProperties
          }
          onAnimationEnd={() => {
            setFlyPayload(null)
            setCartBump(false)
          }}
        >
          {flyPayload.imageUrl ? (
            <img src={flyPayload.imageUrl} alt="" />
          ) : (
            <span className={styles.flyFallback}>☕</span>
          )}
        </div>
      )}

      {product && (
        <div className={styles.productDialog} onClick={() => setProduct(null)}>
          <div className={styles.productPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.productDialogHeader}>
              <button type="button" className={styles.productCloseBtn} onClick={() => setProduct(null)} aria-label="إغلاق">
                ×
              </button>
              <h3 className={styles.productDialogTitle}>{product.name}</h3>
            </div>
            <div ref={productFlyRef}>
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className={styles.productImg} loading="lazy" decoding="async" />
              ) : (
                <div className={styles.productImg} />
              )}
            </div>
            <div className={styles.ingredients}>
              <strong>{t('ingredients')}</strong>
              <p>{product.ingredients || '—'}</p>
            </div>
            {product.options?.map((grp) => (
              <div key={grp.title} className={styles.optionGroup}>
                <strong>{t('how_like')}</strong>
                <div>{grp.title}</div>
                <div className={styles.pills}>
                  {grp.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`${styles.pill} ${selectedOptions[grp.title] === v ? styles.pillActive : ''}`}
                      onClick={() => setSelectedOptions((s) => ({ ...s, [grp.title]: v }))}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className={styles.optionGroup}>
              {t('notes')}
              <textarea
                className={styles.notes}
                placeholder={t('notes_ph')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className={styles.dialogFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ flex: 1 }}
                onClick={handleAddToCart}
                disabled={product.isAvailable === false}
              >
                {product.isAvailable === false ? t('unavailable') : t('add_to_cart')}
              </button>
              <button type="button" className={styles.btnOutline} style={{ flex: 1, margin: 0 }} onClick={() => setProduct(null)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CoordinationDialog
        open={coordinationOpen}
        mode={coordinationMode}
        onWait={handleCoordinationWait}
        onSendAlone={handleCoordinationSendAlone}
        onSendBundle={handleCoordinationSendBundle}
        onCancel={() => setCoordinationOpen(false)}
      />

      <ReceiptDialog open={Boolean(receiptView)} receipt={receiptView} onClose={() => setReceiptView(null)} />

      <ConfirmDialog
        open={billConfirmOpen}
        title={billConfirmReminder ? t('bill_reminder_title') : t('bill_confirm_title')}
        message={billConfirmReminder ? t('bill_reminder_message') : t('bill_confirm_message')}
        confirmLabel={billConfirmReminder ? t('bill_reminder_send') : t('bill_confirm_send')}
        cancelLabel={t('cancel')}
        onConfirm={() => void confirmBillRequest()}
        onCancel={() => {
          setBillConfirmOpen(false)
          setBillConfirmReminder(false)
        }}
      />

      <ConfirmDialog
        open={billInfoOpen}
        title={t('bill_sent_wait_title')}
        message={t('bill_sent_wait_message')}
        variant="success"
        alertLabel={t('ok')}
        onCancel={() => setBillInfoOpen(false)}
        onConfirm={() => setBillInfoOpen(false)}
      />

      <ConfirmDialog
        open={billBlockedOpen}
        title={t('bill_blocked')}
        message={t('bill_blocked_sub')}
        variant="alert"
        alertLabel={t('ok')}
        onCancel={() => setBillBlockedOpen(false)}
        onConfirm={() => setBillBlockedOpen(false)}
      />

      <ConfirmDialog
        open={closeConfirm}
        title={t('confirm_close')}
        message={t('confirm_close_sub')}
        confirmLabel={t('yes')}
        cancelLabel={t('no')}
        onConfirm={handleCloseOrder}
        onCancel={() => setCloseConfirm(false)}
      />

      <ConfirmDialog
        open={welcomeBlock}
        title={t('active_order_block')}
        variant="alert"
        alertLabel={t('ok')}
        onCancel={() => setWelcomeBlock(false)}
        onConfirm={() => setWelcomeBlock(false)}
      />
    </div>
  )
}
