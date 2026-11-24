import { useRef, useState } from 'react'
import type { Bookmark, Group } from '../api'
import { displayUrl, initials, statusLine, statusTitle } from '../util'

export function BookmarkIcon({ b, size }: { b: Bookmark; size: number }) {
  const [broken, setBroken] = useState(false)
  if (b.iconKind === 'favicon' && b.iconUrl && !broken) {
    return (
      <span className="fav-icon" style={{ width: size, height: size }}>
        <img
          src={b.iconUrl}
          alt=""
          width={Math.round(size * 0.6)}
          height={Math.round(size * 0.6)}
          onError={() => {
            setBroken(true)
          }}
        />
      </span>
    )
  }
  return (
    <span
      className={`icon c-${b.iconColor}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
      aria-hidden="true"
    >
      {initials(b.name)}
    </span>
  )
}

export function StatusDot({ b, external, paused }: { b: Bookmark; external: boolean; paused: boolean }) {
  if (external) {
    return (
      <span className="ext-arrow" aria-hidden="true">
        ↗
      </span>
    )
  }
  const cls = paused || !b.lastCheckedAt ? 'unknown' : b.status
  return (
    <span
      className={`dot ${cls}`}
      title={statusTitle(b, external)}
      role="img"
      aria-label={statusTitle(b, external)}
    />
  )
}

interface TileProps {
  b: Bookmark
  group: Group
  now: number
  paused: boolean
  onEdit: (b: Bookmark) => void
  onMenu: (b: Bookmark, anchor: HTMLElement) => void
}

/** One bookmark. The whole tile is the link. Long-press (touch) or the ⋯ button edits it. */
export function Tile({ b, group, now, paused, onEdit, onMenu }: TileProps) {
  const external = group.kind === 'external'
  const press = useRef<number | null>(null)
  const longPressed = useRef(false)
  const kebab = useRef<HTMLButtonElement>(null)

  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    longPressed.current = false
    press.current = window.setTimeout(() => {
      longPressed.current = true
      onEdit(b)
    }, 550)
  }
  const endPress = () => {
    if (press.current !== null) window.clearTimeout(press.current)
    press.current = null
  }

  return (
    <div className={`tile-wrap${external ? ' ext' : ''}`}>
      <a
        className="tile"
        href={b.url}
        rel="noreferrer"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => {
          if (kebab.current) {
            e.preventDefault()
            onMenu(b, kebab.current)
          }
        }}
        onClick={(e) => {
          if (longPressed.current) {
            e.preventDefault()
            longPressed.current = false
          }
        }}
      >
        <BookmarkIcon b={b} size={38} />
        <span className="tile-body">
          <span className="tile-name">{b.name}</span>
          <span className="tile-url desk-line">{displayUrl(b.url)}</span>
          <span className={`tile-url phone-line${b.status === 'down' && !external && !paused ? ' bad' : ''}`}>
            {displayUrl(b.url)} · {statusLine(b, now, external, paused)}
          </span>
          <span className={`tile-check${b.status === 'down' && !external && !paused ? ' bad' : ''}`}>
            {statusLine(b, now, external, paused)}
          </span>
        </span>
        <span className="tile-tags">
          {b.isTemporary && <b className="tag temp">temporary</b>}
          {b.isPrivate && <b className="tag priv">private</b>}
        </span>
        <StatusDot b={b} external={external} paused={paused} />
      </a>
      <button
        ref={kebab}
        type="button"
        className="kebab"
        aria-label={`More for ${b.name}`}
        aria-haspopup="menu"
        onClick={(e) => {
          onMenu(b, e.currentTarget)
        }}
      >
        ⋯
      </button>
    </div>
  )
}

export function FavCard({ b, external, paused }: { b: Bookmark; external: boolean; paused: boolean }) {
  return (
    <a className="fav-card" href={b.url} rel="noreferrer" title={statusTitle(b, external)}>
      <span className="fav-icon-wrap">
        <BookmarkIcon b={b} size={52} />
        {!external && <StatusDot b={b} external={false} paused={paused} />}
      </span>
      <span className="nm">{b.name}</span>
    </a>
  )
}
