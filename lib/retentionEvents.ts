export type RetentionBucket = 'product' | 'treatment'

export type RetentionPrimitive = string | number | boolean | null

export interface RetentionEvent {
  id: string
  bucket: RetentionBucket
  name: string
  at: string
  payload: Record<string, RetentionPrimitive>
}

const MAX_EVENTS = 120
const PRODUCT_KEY = 'lmx:analytics:product'
const TREATMENT_KEY = 'lmx:analytics:treatment'
const MARKER_PREFIX = 'lmx:analytics:marker:'

function storageKey(bucket: RetentionBucket) {
  return bucket === 'product' ? PRODUCT_KEY : TREATMENT_KEY
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function toPrimitive(value: unknown): RetentionPrimitive {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizePayload(payload: Record<string, unknown>): Record<string, RetentionPrimitive> {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, toPrimitive(value)]))
}

function readStoredEvents(bucket: RetentionBucket): RetentionEvent[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(storageKey(bucket))
    if (!raw) return []
    const parsed = JSON.parse(raw) as RetentionEvent[]
    return Array.isArray(parsed) ? parsed.filter(event => event && typeof event.name === 'string') : []
  } catch {
    return []
  }
}

function writeStoredEvents(bucket: RetentionBucket, events: RetentionEvent[]) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(storageKey(bucket), JSON.stringify(events.slice(0, MAX_EVENTS)))
  } catch {
    console.warn('Could not save retention analytics event')
  }
}

function markerKey(bucket: RetentionBucket, key: string) {
  return `${MARKER_PREFIX}${bucket}:${key}`
}

export function hasRetentionMarker(bucket: RetentionBucket, key: string) {
  if (!isBrowser()) return false
  return window.localStorage.getItem(markerKey(bucket, key)) === '1'
}

export function markRetentionMarker(bucket: RetentionBucket, key: string) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(markerKey(bucket, key), '1')
  } catch {
    // Ignore marker failures; events can still be written.
  }
}

export function readRetentionEvents(bucket: RetentionBucket) {
  return readStoredEvents(bucket)
}

export function recordRetentionEvent(
  bucket: RetentionBucket,
  name: string,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  if (!isBrowser()) return null
  if (dedupeKey && hasRetentionMarker(bucket, dedupeKey)) return null

  const event: RetentionEvent = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    bucket,
    name,
    at: new Date().toISOString(),
    payload: normalizePayload(payload),
  }

  const events = readStoredEvents(bucket)
  writeStoredEvents(bucket, [event, ...events].slice(0, MAX_EVENTS))
  if (dedupeKey) markRetentionMarker(bucket, dedupeKey)
  return event
}

export function recordProductRetentionEvent(
  name: string,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  return recordRetentionEvent('product', name, payload, dedupeKey)
}

export function recordTreatmentRetentionEvent(
  name: string,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  return recordRetentionEvent('treatment', name, payload, dedupeKey)
}
