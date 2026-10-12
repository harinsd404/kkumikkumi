import type { KkumiApi } from '../shared/api'

declare global {
  interface Window {
    readonly kkumi: KkumiApi
  }
}
