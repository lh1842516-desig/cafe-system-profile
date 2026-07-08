import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* يمكن ربطه بخدمة مراقبة لاحقاً */
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.wrap}>
          <h1 className={styles.title}>حدث خطأ غير متوقع</h1>
          <p className={styles.sub}>يرجى إعادة تحميل الصفحة للمتابعة.</p>
          <button type="button" className={styles.btn} onClick={() => window.location.reload()}>
            إعادة التحميل
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
