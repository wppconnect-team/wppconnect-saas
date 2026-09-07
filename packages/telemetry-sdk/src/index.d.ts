export interface TelemetryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export interface TelemetryOptions {
  endpoint: string
  apiKey: string
  sourceId: string
  waVersion?: string
  flushIntervalMs?: number
  maxQueue?: number
  compression?: boolean
  autoFlush?: boolean
  fetch?: typeof fetch
  storage?: TelemetryStorage
  requestTimeoutMs?: number
  onError?: (error: unknown) => void
}
export interface TelemetryFlushResult {
  delivered: number
  pending: number
  status?: number
  error?: 'INVALID_ACKNOWLEDGEMENT'
  queueFull?: boolean
}
export class WppTelemetryClient {
  configure(options: TelemetryOptions): this
  increment(key: 'messages.sent' | 'messages.received' | 'messages.deleted' | 'errors.total', quantity?: number): void
  recordMessage(direction: 'sent' | 'received', quantity?: number): void
  recordDeletedMessage(quantity?: number): void
  recordError(quantity?: number): void
  recordResponseLatency(durationMs: number): void
  recordFunction(name: string, durationMs: number, ok?: boolean): void
  setConnected(connected: boolean): void
  flush(): Promise<TelemetryFlushResult>
  close(): Promise<TelemetryFlushResult>
}
export const wppTelemetry: WppTelemetryClient
