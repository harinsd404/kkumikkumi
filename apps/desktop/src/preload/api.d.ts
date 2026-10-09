export interface KkumiApi {
  readonly platform: string
}

declare global {
  interface Window {
    readonly kkumi: KkumiApi
  }
}
