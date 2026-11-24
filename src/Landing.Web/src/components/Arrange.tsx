import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bookmark, Group } from '../api'
import { PALETTE, displayUrl } from '../util'
import { BookmarkIcon } from './Tile'

interface Target {
  groupId: number
  index: number
}

interface Drag {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  width: number
  target: Target | null
}

interface Props {
  groups: Group[]
  onMove: (id: number, groupId: number, index: number) => void
  onEdit: (b: Bookmark) => void
  onRenameGroup: (g: Group, name: string, color: string) => void
  onMoveGroup: (g: Group, delta: -1 | 1) => void
  onDeleteGroup: (g: Group) => void
  onNewGroup: (name: string, external: boolean) => void
}

/**
 * Arrange mode: drag a tile by its handle (mouse or touch) to reorder or move it between groups,
 * or use ↑/↓ and "move to" without dragging. Tiles don't open as links here.
 */
export function Arrange({
  groups,
  onMove,
  onEdit,
  onRenameGroup,
  onMoveGroup,
  onDeleteGroup,
  onNewGroup,
}: Props) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newExternal, setNewExternal] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const dragged = drag ? groups.flatMap((g) => g.bookmarks).find((b) => b.id === drag.id) : undefined

  const findTarget = (x: number, y: number, draggedId: number): Target | null => {
    const lists = root.current?.querySelectorAll<HTMLElement>('[data-drop-group]') ?? []
    for (const list of lists) {
      const r = list.getBoundingClientRect()
      if (x < r.left - 12 || x > r.right + 12 || y < r.top - 24 || y > r.bottom + 24) continue
      const groupId = Number(list.dataset.dropGroup)
      let index = 0
      for (const tile of list.querySelectorAll<HTMLElement>('[data-tile-id]')) {
        if (Number(tile.dataset.tileId) === draggedId) continue
        const t = tile.getBoundingClientRect()
        const cy = t.top + t.height / 2
        const rowAbove = t.bottom < y
        const sameRowBefore = Math.abs(cy - y) < t.height / 2 && t.left + t.width / 2 < x
        if (rowAbove || sameRowBefore) index++
      }
      return { groupId, index }
    }
    return null
  }

  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>, b: Bookmark) => {
    const tile = e.currentTarget.closest<HTMLElement>('[data-tile-id]')
    if (!tile) return
    e.preventDefault()
    const r = tile.getBoundingClientRect()
    setDrag({
      id: b.id,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      width: r.width,
      target: null,
    })
  }

  // While dragging, follow the pointer on the window: the tile itself leaves the list once a slot shows.
  const dragId = drag?.id
  const latest = useRef<Drag | null>(null)
  useLayoutEffect(() => {
    latest.current = drag
  })
  useEffect(() => {
    if (dragId === undefined) return
    const move = (e: PointerEvent) => {
      const d = latest.current
      if (!d) return
      e.preventDefault()
      setDrag({ ...d, x: e.clientX, y: e.clientY, target: findTarget(e.clientX, e.clientY, d.id) })
    }
    const up = () => {
      const d = latest.current
      if (d?.target) onMove(d.id, d.target.groupId, d.target.index)
      setDrag(null)
    }
    const cancel = () => {
      setDrag(null)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [dragId, onMove])

  return (
    <div ref={root} className={`arrange${drag ? ' dragging' : ''}`}>
      {groups.map((g, gi) => {
        const items = g.bookmarks.filter((b) => b.id !== drag?.id || !drag.target)
        const slotAt = drag?.target?.groupId === g.id ? drag.target.index : -1
        return (
          <section className="group" key={g.id}>
            <div className={`sec t-${g.color} arrange-head`}>
              {renaming === g.id ? (
                <GroupRename
                  group={g}
                  onDone={(name, color) => {
                    setRenaming(null)
                    if (name !== g.name || color !== g.color) onRenameGroup(g, name, color)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="link-btn sec-name"
                  onClick={() => {
                    setRenaming(g.id)
                  }}
                >
                  {g.name} ✎{g.kind === 'external' && <span className="count"> external</span>}
                </button>
              )}
              <span className="arrange-group-btns">
                <button
                  type="button"
                  className="mini-btn"
                  disabled={gi === 0}
                  aria-label={`Move ${g.name} up`}
                  onClick={() => onMoveGroup(g, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={gi === groups.length - 1}
                  aria-label={`Move ${g.name} down`}
                  onClick={() => onMoveGroup(g, 1)}
                >
                  ↓
                </button>
                {g.bookmarks.length === 0 && (
                  <button type="button" className="mini-btn red" onClick={() => onDeleteGroup(g)}>
                    delete group
                  </button>
                )}
              </span>
            </div>
            <div className="grid arrange-list" data-drop-group={g.id}>
              {items.map((b, i) => (
                <ArrangeSlot key={b.id} show={slotAt === i}>
                  <ArrangeTile
                    b={b}
                    group={g}
                    groups={groups}
                    index={i}
                    count={g.bookmarks.length}
                    lifted={drag?.id === b.id}
                    onHandleDown={onHandleDown}
                    onMove={onMove}
                    onEdit={onEdit}
                  />
                </ArrangeSlot>
              ))}
              {slotAt >= items.length && <div className="drop-slot" />}
              {g.bookmarks.length === 0 && slotAt < 0 && (
                <div className="empty-group">empty: drag a tile here</div>
              )}
            </div>
          </section>
        )
      })}

      <form
        className="new-group"
        onSubmit={(e) => {
          e.preventDefault()
          if (!newName.trim()) return
          onNewGroup(newName.trim(), newExternal)
          setNewName('')
          setNewExternal(false)
        }}
      >
        <input
          className="input"
          placeholder="new group name"
          aria-label="New group name"
          maxLength={40}
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value)
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={newExternal}
            onChange={(e) => {
              setNewExternal(e.target.checked)
            }}
          />
          external links (no status checks)
        </label>
        <button type="submit" className="btn ghost">
          + add group
        </button>
      </form>

      {drag && dragged && (
        <div
          className="tile arrange-tile lifted floating"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
        >
          <span className="handle" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <BookmarkIcon b={dragged} size={34} />
          <span className="tile-body">
            <span className="tile-name">{dragged.name}</span>
            <span className="tile-url">{displayUrl(dragged.url)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function ArrangeSlot({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <>
      {show && <div className="drop-slot" />}
      {children}
    </>
  )
}

interface TileProps {
  b: Bookmark
  group: Group
  groups: Group[]
  index: number
  count: number
  lifted: boolean
  onHandleDown: (e: React.PointerEvent<HTMLButtonElement>, b: Bookmark) => void
  onMove: (id: number, groupId: number, index: number) => void
  onEdit: (b: Bookmark) => void
}

function ArrangeTile({ b, group, groups, index, count, lifted, onHandleDown, onMove, onEdit }: TileProps) {
  return (
    <div className={`tile arrange-tile${lifted ? ' ghost' : ''}`} data-tile-id={b.id}>
      <button
        type="button"
        className="handle"
        aria-label={`Drag ${b.name}`}
        onPointerDown={(e) => {
          onHandleDown(e, b)
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} />
        ))}
      </button>
      <BookmarkIcon b={b} size={34} />
      <button
        type="button"
        className="tile-body link-btn"
        onClick={() => {
          onEdit(b)
        }}
      >
        <span className="tile-name">{b.name}</span>
        <span className="tile-url">{displayUrl(b.url)}</span>
      </button>
      <span className="arrange-btns">
        <button
          type="button"
          className="mini-btn"
          disabled={index === 0}
          aria-label={`Move ${b.name} up`}
          onClick={() => onMove(b.id, group.id, index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="mini-btn"
          disabled={index === count - 1}
          aria-label={`Move ${b.name} down`}
          onClick={() => onMove(b.id, group.id, index + 1)}
        >
          ↓
        </button>
        <select
          className="mini-select"
          aria-label={`Move ${b.name} to group`}
          value={group.id}
          onChange={(e) => {
            const target = groups.find((g) => g.id === Number(e.target.value))
            if (target) onMove(b.id, target.id, target.bookmarks.length)
          }}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.id === group.id ? 'move to…' : g.name}
            </option>
          ))}
        </select>
      </span>
    </div>
  )
}

function GroupRename({ group, onDone }: { group: Group; onDone: (name: string, color: string) => void }) {
  const [name, setName] = useState(group.name)
  const [color, setColor] = useState(group.color)
  return (
    <form
      className="group-rename"
      onSubmit={(e) => {
        e.preventDefault()
        onDone(name.trim() || group.name, color)
      }}
    >
      <input
        className="input"
        aria-label="Group name"
        maxLength={40}
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value)
        }}
      />
      <span className="swatches" role="radiogroup" aria-label="Group color">
        {PALETTE.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            className={`swatch c-${c}${color === c ? ' on' : ''}`}
            onClick={() => {
              setColor(c)
            }}
          />
        ))}
      </span>
      <button type="submit" className="mini-btn">
        done
      </button>
    </form>
  )
}
