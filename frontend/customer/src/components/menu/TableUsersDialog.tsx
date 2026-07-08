import { useTranslation } from '@/hooks/useTranslation'
import { EMOJI_OPTIONS } from '@/utils/emojiConfig'
import { getPeerStatusLabel } from '@/utils/peerStatus'
import type { TableUser } from '@/types/table.types'
import styles from './TableUsersDialog.module.css'

interface TableUsersDialogProps {
  open: boolean
  onClose: () => void
  users: TableUser[]
  mySessionId: string | null
  onPickEmoji: (emoji: string, label: string, emojiId: string) => void
}

export function TableUsersDialog({ open, onClose, users, mySessionId, onPickEmoji }: TableUsersDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="إغلاق">
            ×
          </button>
          <h2 className={styles.title}>{t('table_users')}</h2>
        </div>

        <div className={styles.userList}>
          {users.filter((u) => u.connected !== false).map((u) => (
            <div key={u.sessionId} className={styles.userRow}>
              <span className={styles.userName}>
                {u.customerName}
                {u.sessionId === mySessionId ? ` — ${t('peer_you')}` : ''}
                {' — '}
                {getPeerStatusLabel(u.status, u.sessionId === mySessionId, t)}
              </span>
            </div>
          ))}
        </div>

        <p className={styles.quickTitle}>{t('table_users_quick')}</p>
        <div className={styles.emojiRow}>
          {EMOJI_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={styles.emojiBtn}
              onClick={() => onPickEmoji(opt.emoji, opt.label, opt.id)}
            >
              <span className={styles.emojiBtnLabel}>{opt.label}</span>
              <span className={styles.emojiBtnIcon} aria-hidden>
                {opt.emoji}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
