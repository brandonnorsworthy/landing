import { ago } from '../util'

function Blobs({ sad }: { sad?: boolean }) {
  return (
    <div className={`blob-art${sad ? ' sad' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  )
}

export function EmptyBoard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty">
      <Blobs />
      <h3>nothing here yet</h3>
      <p>
        Add the places you go most, like Arcane, Plex or the router, and they'll be one tap away on every
        device.
      </p>
      <button type="button" className="btn primary" onClick={onAdd}>
        + add your first bookmark
      </button>
    </div>
  )
}

export function LoadError({
  onRetry,
  lastTried,
  now,
}: {
  onRetry: () => void
  lastTried: number
  now: number
}) {
  return (
    <div className="empty" role="alert">
      <Blobs sad />
      <h3>the vibes are off</h3>
      <p>
        Couldn't reach home.example to load your bookmarks. The server may be restarting, or this device may be
        off the home network.
      </p>
      <button type="button" className="btn primary" onClick={onRetry}>
        try again
      </button>
      <div className="hint">
        retrying by itself every 15s · last tried {ago(new Date(lastTried).toISOString(), now)}
      </div>
    </div>
  )
}

export function NoResults({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <div className="empty small">
      <h3>no "{query}" on the board</h3>
      <p>Nothing matches by name, URL or group.</p>
      <button type="button" className="btn ghost" onClick={onAdd}>
        + add "{query}"
      </button>
    </div>
  )
}

export function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading bookmarks">
      <div className="skel" style={{ width: 80, height: 14, marginBottom: 12 }} />
      <div className="fav-strip">
        {[60, 50, 64].map((w) => (
          <div className="fav-card" key={w}>
            <div className="skel blob" style={{ width: 52, height: 52 }} />
            <div className="skel" style={{ width: w, height: 10 }} />
          </div>
        ))}
      </div>
      <div className="skel" style={{ width: 110, height: 14, margin: '8px 0 12px' }} />
      <div className="grid">
        {[55, 40, 62, 48].map((w) => (
          <div className="skel-tile" key={w}>
            <div className="skel blob" style={{ width: 38, height: 38 }} />
            <div style={{ flex: 1 }}>
              <div className="skel" style={{ width: `${w}%`, height: 11, marginBottom: 6 }} />
              <div className="skel" style={{ width: '78%', height: 9 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
