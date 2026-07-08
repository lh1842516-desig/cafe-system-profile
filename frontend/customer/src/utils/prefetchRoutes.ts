let menuPrefetched = false
let orderStatusPrefetched = false

export function prefetchMenuPage() {
  if (menuPrefetched) return
  menuPrefetched = true
  void import('@/pages/MenuPage/MenuPage')
}

export function prefetchWelcomePage() {
  /* مرحّبة محمّلة بشكل ثابت مع App — لا حاجة لتحميل ديناميكي */
}

export function prefetchOrderStatusPage() {
  if (orderStatusPrefetched) return
  orderStatusPrefetched = true
  void import('@/pages/OrderStatusPage/OrderStatusPage')
}

export function prefetchAllCustomerPages() {
  prefetchMenuPage()
  prefetchOrderStatusPage()
}
