interface Props {
  compact: boolean
  setCompact: (v: boolean) => void
  autoRefresh: boolean
  setAutoRefresh: (v: boolean) => void
  onLock: () => void
  version: string
}

/** Per-device settings (kept in this browser). The Earthy mode toggle from the prototype is gone: it did nothing. */
export function Settings({ compact, setCompact, autoRefresh, setAutoRefresh, onLock, version }: Props) {
  return (
    <div className="settings">
      <h1 className="title kalam">settings</h1>
      <div className="switches">
        <label className="sw">
          <span className="txt">
            <b>Auto-refresh status</b>
            <span>reload the board every 30 seconds</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="toggle"
            checked={autoRefresh}
            onChange={(e) => {
              setAutoRefresh(e.target.checked)
            }}
          />
        </label>
        <label className="sw">
          <span className="txt">
            <b>Compact density</b>
            <span>smaller tiles, more on screen</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="toggle"
            checked={compact}
            onChange={(e) => {
              setCompact(e.target.checked)
            }}
          />
        </label>
      </div>
      <p className="hint settings-note">These settings are saved on this device only.</p>
      <button type="button" className="lock-btn" onClick={onLock}>
        lock the dashboard
      </button>
      <p className="hint settings-note">
        The lock screen is just a screensaver: one tap opens it. It comes back after 2 minutes idle.
      </p>
      <p className="hint settings-note">landing {version}</p>
    </div>
  )
}
