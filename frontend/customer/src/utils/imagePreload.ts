/** تحميل مسبق للصور في الذاكرة — مرة واحدة لكل رابط */
const preloaded = new Set<string>()

function scheduleIdle(cb: () => void) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(cb, { timeout: 120 })
    return
  }
  setTimeout(cb, 0)
}

export function preloadImageUrls(urls: Iterable<string | null | undefined>) {
  const batch: string[] = []
  for (const raw of urls) {
    const url = String(raw || '').trim()
    if (!url || preloaded.has(url)) continue
    preloaded.add(url)
    batch.push(url)
  }
  if (!batch.length) return

  let i = 0
  const chunk = 8
  function run() {
    const slice = batch.slice(i, i + chunk)
    i += chunk
    for (const url of slice) {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
    }
    if (i < batch.length) scheduleIdle(run)
  }
  run()
}

/** صور التصنيفات أولاً — أسرع ظهور الشبكة الرئيسية */
export function preloadCategoryImages(urls: Iterable<string | null | undefined>) {
  preloadImageUrls(urls)
}

/** صور منتجات تصنيف محدد عند فتحه */
export function preloadProductImages(urls: Iterable<string | null | undefined>) {
  preloadImageUrls(urls)
}
