import axios from 'axios'

function resolveBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin.replace(/\/$/, '')
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err?.config as (typeof err.config & { __retryCount?: number }) | undefined
    const method = String(config?.method || 'get').toLowerCase()
    if (config && method === 'get' && (config.__retryCount ?? 0) < 2) {
      config.__retryCount = (config.__retryCount ?? 0) + 1
      await new Promise((r) => setTimeout(r, 180 * config.__retryCount!))
      return api(config)
    }
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      'خطأ في الاتصال'
    const code = err?.response?.data?.code
    const error = new Error(String(message)) as Error & { code?: string }
    if (code) error.code = String(code)
    return Promise.reject(error)
  },
)
