import { useEffect, useState } from 'react'
import type { Bookmark } from './api'

/** The fixed palette (keys match Palette.Keys on the server). */
export const PALETTE = ['terra', 'amber', 'moss', 'teal', 'plum', 'rose', 'sky', 'clay'] as const
export type PaletteKey = (typeof PALETTE)[number]

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = words[0] ?? '?'
  const second = words[1]
  const pair = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)
  return pair.toUpperCase() || '?'
}

/** "24s ago", "3m ago", "2h ago", "3 days ago". */
export function ago(iso: string | null, now: number): string | null {
  if (!iso) return null
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)} days ago`
}

/** URL without the scheme, for the tile's detail line. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** One-line status detail: "checked 24s ago", "slow: 2.4s · checked 24s ago", "down since 3 days ago". */
export function statusLine(b: Bookmark, now: number, external: boolean, paused: boolean): string {
  if (external) return 'no status check for external links'
  const checked = ago(b.lastCheckedAt, now)
  if (!checked) return 'not checked yet'
  if (paused) return `last seen ${b.status} ${checked}`
  if (b.status === 'down')
    return `down since ${ago(b.statusSince, now) ?? checked} · ${b.statusDetail ?? 'no response'}`
  if (b.status === 'warning') return `${b.statusDetail ?? 'warning'} · checked ${checked}`
  return `checked ${checked}`
}

export function statusTitle(b: Bookmark, external: boolean): string {
  if (external) return 'External link: not status-checked'
  if (!b.lastCheckedAt) return 'Not checked yet'
  const when = new Date(b.lastCheckedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
  const what =
    b.status === 'up'
      ? 'up'
      : b.status === 'warning'
        ? `warning: ${b.statusDetail ?? 'reachable but unhealthy'}`
        : b.status === 'down'
          ? `down: ${b.statusDetail ?? 'no response'}`
          : 'unknown'
  return `${what}. Last checked ${when}.`
}

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now())
    }, ms)
    return () => {
      window.clearInterval(t)
    }
  }, [ms])
  return now
}

/** A boolean or string setting kept per device in localStorage. */
export function useStored<T extends boolean | string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initial
      const parsed = JSON.parse(raw) as unknown
      return typeof parsed === typeof initial ? (parsed as T) : initial
    } catch {
      return initial
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      // storage full or blocked: the setting just won't persist
    }
  }
  return [value, set]
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  return h < 12 ? 'good morning' : h < 18 ? 'good afternoon' : 'good evening'
}
