import { describe, expect, it } from 'vitest'
import { getPeerStatusKey, normalizePeerStatus } from './peerStatus'

describe('peerStatus', () => {
  it('normalizes kitchen pipeline statuses', () => {
    expect(normalizePeerStatus('awaiting_prep')).toBe('awaiting_prep')
    expect(normalizePeerStatus('kitchen_preparing')).toBe('kitchen_preparing')
    expect(normalizePeerStatus('kitchen_prepared')).toBe('kitchen_prepared')
    expect(normalizePeerStatus('ordered')).toBe('awaiting_prep')
    expect(normalizePeerStatus('waiting')).toBe('awaiting_prep')
  })

  it('uses self vs peer labels', () => {
    expect(getPeerStatusKey('awaiting_prep', true)).toBe('peer_status_awaiting_self')
    expect(getPeerStatusKey('awaiting_prep', false)).toBe('peer_status_awaiting_peer')
    expect(getPeerStatusKey('kitchen_prepared', true)).toBe('peer_status_completed_self')
    expect(getPeerStatusKey('kitchen_prepared', false)).toBe('peer_status_completed_peer')
  })
})
