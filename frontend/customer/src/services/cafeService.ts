import { api } from './api'
import type { CafeSettings } from '@/types/cafe.types'

export async function fetchCafeSettings(): Promise<CafeSettings> {
  const { data } = await api.get<CafeSettings>('/api/settings/cafe')
  return {
    cafeName: data?.cafeName || 'الكافيه',
    logoUrl: data?.logoUrl ?? null,
    requireCashierKitchenApproval: data?.requireCashierKitchenApproval,
  }
}
