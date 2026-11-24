import { useState } from 'react'

const RING = ['terra', 'amber', 'moss', 'teal', 'rose', 'clay', 'amber', 'moss']

/** Cosmetic idle screen. One tap dismisses it. It is not, and must not be treated as, access control. */
export function LockScreen({ now, onUnlock }: { now: number; onUnlock: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const d = new Date(now)
  const unlock = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onUnlock, 450)
  }
  return (
    <div
      className={`lock-screen${leaving ? ' unlocking' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Tap to open the dashboard"
      onClick={unlock}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') unlock()
      }}
    >
      <div className="lock-tag kalam">homelab &amp; good vibes</div>
      <div className="lock-time kalam">
        {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </div>
      <div className="lock-date">
        {d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      <div className="faceid-outer" aria-hidden="true">
        <div className="faceid-ring">
          {RING.map((c, i) => (
            <div key={i} className={`ring-bit r${i} bg-${c}`} />
          ))}
        </div>
        <div className={`faceid-core${leaving ? ' scanning' : ''}`} />
      </div>
      <div className="lock-hint">{leaving ? 'feeling the vibes…' : 'tap to unlock'}</div>
    </div>
  )
}
