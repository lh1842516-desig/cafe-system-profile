export interface EmojiOption {
  id: string
  emoji: string
  label: string
}

export const EMOJI_OPTIONS: EmojiOption[] = [
  { id: 'hungry', emoji: '😋', label: 'جوعان' },
  { id: 'sleep', emoji: '😴', label: 'نعست راح انام' },
  { id: 'hurry', emoji: '⏰', label: 'مستعجل' },
  { id: 'peer', emoji: '😤', label: 'يلا يمعود' },
  { id: 'ready', emoji: '✅', label: 'أنا جاهز' },
]

export function getEmojiLabel(emoji: string): string {
  const found = EMOJI_OPTIONS.find((o) => o.emoji === emoji)
  return found?.label ?? ''
}
