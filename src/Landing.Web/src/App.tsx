import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, type Board, type Bookmark, type Group } from './api'
import { Arrange } from './components/Arrange'
import { BookmarkForm } from './components/BookmarkForm'
import { LockScreen } from './components/LockScreen'
import { Settings } from './components/Settings'
import { EmptyBoard, LoadError, NoResults, Skeleton } from './components/States'
import { FavCard, Tile } from './components/Tile'
import { greeting, useNow, useStored } from './util'

const IDLE_MS = 2 * 60 * 1000
const REFRESH_MS = 30 * 1000
const RETRY_MS = 15 * 1000
const SKELETON_DELAY_MS = 300

type Tab = 'dashboard' | 'settings'
type FormState = { editing: Bookmark | null; seed?: { name?: string; groupId?: number } } | null
interface Toast {
  text: string
  undo?: () => void
}
interface Menu {
  b: Bookmark
  x: number
  y: number
  moveOpen: boolean
}

export function App() {
  const [board, setBoard] = useState<Board | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [lastTried, setLastTried] = useState(() => Date.now())
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [query, setQuery] = useState('')
  const [arranging, setArranging] = useState(false)
  const [form, setForm] = useState<FormState>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [locked, setLocked] = useState(false)
  const [compact, setCompact] = useStored<boolean>('landing.compact', false)
  const [autoRefresh, setAutoRefresh] = useStored<boolean>('landing.autoRefresh', true)
  const now = useNow(5000)
  const toastTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const b = await api.board()
      setBoard(b)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLastTried(Date.now())
    }
  }, [])

  // First load, with skeletons only if it is slow enough to notice.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setShowSkeleton(true)
    }, SKELETON_DELAY_MS)
    // load() sets state only after its await, so this doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().finally(() => {
      window.clearTimeout(t)
    })
    return () => {
      window.clearTimeout(t)
    }
  }, [load])

  // Auto-refresh (setting), and retry while the board can't load.
  useEffect(() => {
    const every = loadFailed ? RETRY_MS : autoRefresh ? REFRESH_MS : 0
    if (!every) return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, every)
    return () => {
      window.clearInterval(t)
    }
  }, [autoRefresh, loadFailed, load])

  // Cosmetic idle screen after 2 minutes without input. Not security.
  useEffect(() => {
    let t = window.setTimeout(() => {
      setLocked(true)
    }, IDLE_MS)
    const reset = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        setLocked(true)
      }, IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'pointermove'] as const
    events.forEach((e) => {
      window.addEventListener(e, reset, { passive: true })
    })
    return () => {
      window.clearTimeout(t)
      events.forEach((e) => {
        window.removeEventListener(e, reset)
      })
    }
  }, [])

  // While a modal or menu is open, the lock screen waits.
  const blocked = form !== null || menu !== null || arranging
  const showLock = locked && !blocked

  const say = useCallback((text: string, undo?: () => void) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = window.setTimeout(() => {
      setToast(null)
    }, 6000)
  }, [])

  const fail = useCallback(
    (e: unknown) => {
      say(
        e instanceof ApiError && e.status === 0
          ? "couldn't reach the site; nothing changed"
          : `that didn't work: ${e instanceof Error ? e.message : 'unknown error'}`,
      )
      void load()
    },
    [say, load],
  )

  const groups = useMemo(() => board?.groups ?? [], [board])
  const groupOf = useCallback((b: Bookmark) => groups.find((g) => g.id === b.groupId), [groups])

  const checker = board?.checker
  const lastRun = checker?.lastRunAt ?? null
  const pausedSince =
    checker && lastRun && now - Date.parse(lastRun) > checker.intervalSeconds * 3 * 1000 + 30_000
      ? lastRun
      : null
  const paused = pausedSince !== null

  const all = groups.flatMap((g) => g.bookmarks)
  const favorites = all.filter((b) => b.isFavorite)
  const q = query.trim().toLowerCase()
  const results = q
    ? all.filter((b) => {
        const g = groupOf(b)
        return (
          b.name.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          (g?.name.toLowerCase().includes(q) ?? false)
        )
      })
    : []

  // ── actions ─────────────────────────────────────────────────────────

  const move = useCallback(
    (id: number, groupId: number, index: number) => {
      // Optimistic: reorder locally, then confirm with the server.
      setBoard((b) => {
        if (!b) return b
        const moving = b.groups.flatMap((g) => g.bookmarks).find((x) => x.id === id)
        if (!moving) return b
        const next = b.groups.map((g) => ({ ...g, bookmarks: g.bookmarks.filter((x) => x.id !== id) }))
        const target = next.find((g) => g.id === groupId)
        target?.bookmarks.splice(Math.max(0, Math.min(index, target.bookmarks.length)), 0, {
          ...moving,
          groupId,
        })
        return { ...b, groups: next }
      })
      api
        .moveBookmark(id, groupId, index)
        .then(() => load())
        .catch(fail)
    },
    [load, fail],
  )

  const remove = useCallback(
    (b: Bookmark) => {
      setForm(null)
      setMenu(null)
      api
        .deleteBookmark(b.id)
        .then(async () => {
          await load()
          say(`${b.name} deleted`, () => {
            api
              .restoreBookmark(b.id)
              .then(async () => {
                await load()
                say(`${b.name} is back`)
              })
              .catch(fail)
          })
        })
        .catch(fail)
    },
    [load, say, fail],
  )

  const toggleFavorite = (b: Bookmark) => {
    setMenu(null)
    api
      .updateBookmark(b.id, {
        name: b.name,
        url: b.url,
        groupId: b.groupId,
        newGroupName: null,
        iconKind: b.iconKind,
        iconColor: b.iconColor,
        isFavorite: !b.isFavorite,
        isTemporary: b.isTemporary,
        isPrivate: b.isPrivate,
      })
      .then(() => load())
      .catch(fail)
  }

  const moveGroup = (g: Group, delta: -1 | 1) => {
    const ids = groups.map((x) => x.id)
    const i = ids.indexOf(g.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j] ?? g.id, g.id]
    api
      .reorderGroups(ids)
      .then(() => load())
      .catch(fail)
  }

  const openMenu = (b: Bookmark, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect()
    const x = Math.min(r.left, window.innerWidth - 200)
    const y = r.bottom + 4 + 260 > window.innerHeight ? Math.max(8, r.top - 264) : r.bottom + 4
    setMenu({ b, x, y, moveOpen: false })
  }

  // ── render ──────────────────────────────────────────────────────────

  const addButton = (seed?: { name?: string; groupId?: number }) => () => {
    setForm({ editing: null, seed })
  }

  const header = (
    <header className="top">
      <div>
        <div className="hello">{arranging ? 'arranging' : `${greeting(new Date(now))}, friend`}</div>
        <h1 className="title kalam">{tab === 'settings' ? 'settings' : 'the dashboard'}</h1>
      </div>
      {tab === 'dashboard' && board && board.groups.length > 0 && (
        <div className="search desk-only">
          <input
            type="search"
            aria-label="Search bookmarks"
            placeholder="find your zen (search apps)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
        </div>
      )}
      <span className="spacer" />
      <nav className="desk-nav desk-only" aria-label="Sections">
        <button type="button" className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>
          dashboard
        </button>
        <button type="button" className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          settings
        </button>
      </nav>
      {tab === 'dashboard' && board && board.groups.length > 0 && (
        <>
          <button
            type="button"
            className={`edit-pill${arranging ? ' on' : ''}`}
            aria-pressed={arranging}
            onClick={() => {
              setArranging(!arranging)
              setQuery('')
            }}
          >
            {arranging ? 'done' : 'arrange'}
          </button>
          <button type="button" className="btn primary desk-only" onClick={addButton()}>
            + add bookmark
          </button>
        </>
      )}
    </header>
  )

  let body: React.ReactNode
  if (tab === 'settings') {
    body = (
      <Settings
        compact={compact}
        setCompact={setCompact}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        onLock={() => {
          setLocked(true)
        }}
        version={board?.version ?? ''}
      />
    )
  } else if (!board) {
    body = loadFailed ? (
      <LoadError onRetry={() => void load()} lastTried={lastTried} now={now} />
    ) : showSkeleton ? (
      <Skeleton />
    ) : null
  } else if (board.groups.every((g) => g.bookmarks.length === 0) && !arranging) {
    body = <EmptyBoard onAdd={addButton()} />
  } else if (arranging) {
    body = (
      <Arrange
        groups={groups}
        onMove={move}
        onEdit={(b) => {
          setForm({ editing: b })
        }}
        onRenameGroup={(g, name, color) => {
          api
            .updateGroup(g.id, name, color)
            .then(() => load())
            .catch(fail)
        }}
        onMoveGroup={moveGroup}
        onDeleteGroup={(g) => {
          api
            .deleteGroup(g.id)
            .then(() => load())
            .catch(fail)
        }}
        onNewGroup={(name, external) => {
          api
            .createGroup(name, external ? 'external' : 'normal', external ? 'plum' : 'terra')
            .then(() => load())
            .catch(fail)
        }}
      />
    )
  } else {
    body = (
      <>
        <div className="search phone-only">
          <input
            type="search"
            aria-label="Search bookmarks"
            placeholder="find your zen (search apps)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
        </div>

        {loadFailed && (
          <div className="banner bad" role="status">
            <span aria-hidden="true">⚠</span>
            <div>
              <b>showing the last copy</b>Couldn't reach the site just now. Retrying every 15s.
            </div>
          </div>
        )}
        {pausedSince && (
          <div className="banner warnb" role="status">
            <span aria-hidden="true">◌</span>
            <div>
              <b>status checks paused</b>The checker hasn't reported since{' '}
              {new Date(pausedSince).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, so the
              dots are greyed out. Links still work.
            </div>
          </div>
        )}

        {q ? (
          results.length === 0 ? (
            <NoResults query={query.trim()} onAdd={addButton({ name: query.trim() })} />
          ) : (
            <section className="group">
              <div className="sec t-terra">results</div>
              <div className="grid">
                {results.map((b) => {
                  const g = groupOf(b)
                  return g ? (
                    <Tile
                      key={b.id}
                      b={b}
                      group={g}
                      now={now}
                      paused={paused}
                      onEdit={(x) => setForm({ editing: x })}
                      onMenu={openMenu}
                    />
                  ) : null
                })}
              </div>
            </section>
          )
        ) : (
          <>
            {favorites.length > 0 && (
              <section className="group">
                <div className="sec t-terra">favorites</div>
                <div className="fav-strip">
                  {favorites.map((b) => (
                    <FavCard key={b.id} b={b} external={groupOf(b)?.kind === 'external'} paused={paused} />
                  ))}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <section className="group" key={g.id}>
                <h2 className={`sec t-${g.color}`}>
                  {g.name} <span className="count">{g.bookmarks.length}</span>
                </h2>
                <div className="grid">
                  {g.bookmarks.map((b) => (
                    <Tile
                      key={b.id}
                      b={b}
                      group={g}
                      now={now}
                      paused={paused}
                      onEdit={(x) => setForm({ editing: x })}
                      onMenu={openMenu}
                    />
                  ))}
                  <button type="button" className="add-tile" onClick={addButton({ groupId: g.id })}>
                    + add to {g.name}
                  </button>
                </div>
              </section>
            ))}
          </>
        )}
      </>
    )
  }

  return (
    <div className={`app${compact ? ' compact' : ''}`}>
      <main className="scroll">
        {header}
        {body}
      </main>

      <nav className="tab-bar phone-only" aria-label="Sections">
        <button
          type="button"
          className={`tab-item${tab === 'dashboard' ? ' on' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          <span className="tab-grid" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="tab-label">dashboard</span>
        </button>
        {tab === 'dashboard' && board && (
          <button type="button" className="tab-add" aria-label="Add bookmark" onClick={addButton()}>
            +
          </button>
        )}
        <button
          type="button"
          className={`tab-item${tab === 'settings' ? ' on' : ''}`}
          onClick={() => setTab('settings')}
        >
          <span className="tab-ring" aria-hidden="true" />
          <span className="tab-label">settings</span>
        </button>
      </nav>

      {menu && (
        <div
          className="menu-scrim"
          onClick={() => {
            setMenu(null)
          }}
        >
          <div
            className="menu"
            role="menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => {
              e.stopPropagation()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenu(null)
            }}
          >
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => (setMenu(null), setForm({ editing: menu.b }))}
            >
              edit…
            </button>
            <button
              type="button"
              role="menuitem"
              aria-expanded={menu.moveOpen}
              onClick={() => setMenu({ ...menu, moveOpen: !menu.moveOpen })}
            >
              move to ▸
            </button>
            {menu.moveOpen &&
              groups
                .filter((g) => g.id !== menu.b.groupId)
                .map((g) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={g.id}
                    className="sub"
                    onClick={() => {
                      setMenu(null)
                      move(menu.b.id, g.id, g.bookmarks.length)
                      say(`${menu.b.name} moved to ${g.name}`, () => {
                        const from = groups.find((x) => x.id === menu.b.groupId)
                        if (from)
                          move(
                            menu.b.id,
                            from.id,
                            from.bookmarks.findIndex((x) => x.id === menu.b.id),
                          )
                      })
                    }}
                  >
                    {g.name}
                  </button>
                ))}
            <button type="button" role="menuitem" onClick={() => toggleFavorite(menu.b)}>
              {menu.b.isFavorite ? '★ unfavorite' : '☆ favorite'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null)
                // Undefined on plain http, whatever the type says.
                const clip = navigator.clipboard as Clipboard | undefined
                if (!clip) {
                  say("couldn't copy here (the browser needs https)")
                  return
                }
                void clip
                  .writeText(menu.b.url)
                  .then(() => {
                    say('URL copied')
                  })
                  .catch(() => {
                    say("couldn't copy here")
                  })
              }}
            >
              copy URL
            </button>
            <hr />
            <button type="button" role="menuitem" className="red" onClick={() => remove(menu.b)}>
              delete
            </button>
          </div>
        </div>
      )}

      {form && (
        <BookmarkForm
          groups={groups}
          editing={form.editing}
          seed={form.seed}
          onClose={() => {
            setForm(null)
          }}
          onSaved={(msg) => {
            setForm(null)
            say(msg)
            void load()
          }}
          onDelete={remove}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo
                setToast(null)
                undo?.()
              }}
            >
              undo
            </button>
          )}
        </div>
      )}

      {showLock && (
        <LockScreen
          now={now}
          onUnlock={() => {
            setLocked(false)
          }}
        />
      )}
    </div>
  )
}
