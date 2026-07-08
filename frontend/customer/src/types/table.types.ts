export type UserStatus =
  | 'choosing'
  | 'browsing'
  | 'ready'
  | 'ordered'
  | 'awaiting_prep'
  | 'kitchen_preparing'
  | 'kitchen_prepared'

export interface TableUser {
  sessionId: string
  customerName: string
  status: UserStatus
  emoji?: string | null
  connected?: boolean
}

export interface EmojiReaction {
  sessionId: string
  emoji: string
  label?: string
  at: number
}
