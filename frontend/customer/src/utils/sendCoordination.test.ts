import { describe, expect, it } from 'vitest'
import { getCoordinationMode, shouldShowCoordinationDialog } from './sendCoordination'
import type { TableUser } from '@/types/table.types'

const me = 'sess-me'
const users: TableUser[] = [
  { sessionId: me, customerName: 'أنا', status: 'choosing', connected: true, emoji: null },
  { sessionId: 'sess-2', customerName: 'صديق', status: 'choosing', connected: true, emoji: null },
]

describe('sendCoordination', () => {
  it('shows dialog when another user is still choosing', () => {
    expect(shouldShowCoordinationDialog(users, me)).toBe(true)
  })

  it('auto-sends when peer is ready', () => {
    const readyUsers: TableUser[] = [
      users[0],
      { ...users[1], status: 'ready' },
    ]
    expect(shouldShowCoordinationDialog(readyUsers, me)).toBe(false)
    expect(getCoordinationMode(readyUsers, me)).toBe('bundle_or_alone')
  })
})
