import { api } from './api'
import type { Category, Product } from '@/types/menu.types'

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/api/categories')
  return Array.isArray(data) ? data : []
}

export async function fetchMenu(): Promise<Product[]> {
  const { data } = await api.get<Product[]>('/api/menu')
  if (!Array.isArray(data)) return []
  return data.map((item) => ({
    ...item,
    isAvailable: item.isAvailable !== false,
    options: Array.isArray(item.options) ? item.options : [],
    imageUrl: item.imageUrl || '',
    ingredients: item.ingredients || '',
  }))
}
