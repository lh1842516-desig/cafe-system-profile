import { create } from 'zustand'
import type { EmojiReaction, TableUser } from '@/types/table.types'

let emojiTimer: ReturnType<typeof setTimeout> | null = null

interface TableStore {
  users: TableUser[]
  activeEmoji: EmojiReaction | null
  setUsers: (users: TableUser[]) => void
  triggerEmoji: (reaction: EmojiReaction) => void
  clearEmoji: () => void
  reset: () => void
}

export const useTableStore = create<TableStore>((set) => ({
  users: [],
  activeEmoji: null,

  setUsers(users) {
    set({ users })
  },

  triggerEmoji(reaction) {
    if (emojiTimer) clearTimeout(emojiTimer)
    set({ activeEmoji: reaction })
    emojiTimer = setTimeout(() => {
      set({ activeEmoji: null })
      emojiTimer = null
    }, 3200)
  },

  clearEmoji() {
    if (emojiTimer) clearTimeout(emojiTimer)
    emojiTimer = null
    set({ activeEmoji: null })
  },

  reset() {
    if (emojiTimer) clearTimeout(emojiTimer)
    emojiTimer = null
    set({ users: [], activeEmoji: null })
  },
}))
