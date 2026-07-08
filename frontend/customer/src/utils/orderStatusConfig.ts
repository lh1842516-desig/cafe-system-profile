import type { OrderStatus } from '@/types/order.types'

export interface StatusConfig {
  label: string
  sublabel: string
  /** نص بديل لبطاقة «الحالة الحالية» في صفحة حالة الطلب (اختياري) */
  infoLabel?: string
  /** وصف بديل لبطاقة «الحالة الحالية» (اختياري) */
  infoSub?: string
  gradient: string
  accent: string
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  pending: {
    label: 'بانتظار موافقة الكاشير',
    sublabel: 'تم إرسال طلبك إلى الكاشير للتأكيد. بعد الموافقة سيُرسل الطلب إلى المطبخ.',
    gradient: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)',
    accent: 'var(--color-status-pending)',
  },
  waiting: {
    label: 'انتظار تجهيز الطلب',
    sublabel: 'طلبك في قائمة انتظار المطبخ.',
    gradient: 'linear-gradient(180deg, #fdba74 0%, #fb923c 100%)',
    accent: 'var(--color-status-waiting)',
  },
  preparing: {
    label: 'جاري التجهيز',
    sublabel: 'المطبخ يجهّز طلبك الآن.',
    gradient: 'linear-gradient(180deg, #a5b4fc 0%, #818cf8 100%)',
    accent: 'var(--color-status-preparing)',
  },
  ready: {
    label: 'طلبك صار جاهز وجايك ركض! 😍',
    sublabel: 'ثواني والوجبة الطيبة تصير على طاولتك.. طلعناها من المطبخ وهسة هي بالطريق إلك.',
    infoLabel: 'ثواني ويوصلك 🍽',
    infoSub: 'انتظرنا دقيقة وحدة بس، الطلب بالطريق لطاولتك وألف عافية مقدماً!',
    gradient: 'linear-gradient(180deg, #6ee7b7 0%, #34d399 100%)',
    accent: 'var(--color-status-ready)',
  },
  rejected: {
    label: 'لم يوافق الكاشير',
    sublabel: 'يرجى مراجعة الكاشير.',
    gradient: 'linear-gradient(180deg, #fecaca 0%, #f87171 100%)',
    accent: 'var(--color-danger)',
  },
}

export function mapKitchenStatus(raw: string, awaitingCashier?: boolean): OrderStatus {
  const s = String(raw || '').toLowerCase()
  if (s === 'rejected' || s === 'cancelled' || s === 'canceled') return 'rejected'
  if (awaitingCashier || s === 'held' || s === 'pending') return 'pending'
  if (s === 'new' || s === 'awaiting_prep' || s === 'editing') return 'waiting'
  if (s === 'preparing' || s === 'kitchen_preparing') return 'preparing'
  if (s === 'completed' || s === 'done' || s === 'kitchen_prepared') return 'ready'
  return 'waiting'
}
