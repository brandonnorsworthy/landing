import { useEffect, useId, useRef, useState } from 'react'
import {
  ApiError,
  api,
  type Bookmark,
  type BookmarkInput,
  type Group,
  type IconKind,
  type Preview,
} from '../api'
import { PALETTE, initials } from '../util'

interface Props {
  groups: Group[]
  /** null = add a new bookmark */
  editing: Bookmark | null
  /** For "add" from a search with no results, or "+ add to <group>". */
  seed?: { name?: string; groupId?: number }
  onClose: () => void
  onSaved: (message: string) => void
  onDelete: (b: Bookmark) => void
}

/** Add and edit. Bottom sheet on phone, centered modal on desktop (same markup, CSS decides). */
export function BookmarkForm({ groups, editing, seed, onClose, onSaved, onDelete }: Props) {
  const firstGroup = groups.find((g) => g.kind === 'normal') ?? groups[0]
  const [url, setUrl] = useState(editing?.url ?? '')
  const [name, setName] = useState(editing?.name ?? seed?.name ?? '')
  const [nameTouched, setNameTouched] = useState(editing !== null || Boolean(seed?.name))
  const [groupId, setGroupId] = useState<number | null>(
    editing?.groupId ?? seed?.groupId ?? firstGroup?.id ?? null,
  )
  const [newGroup, setNewGroup] = useState<string | null>(groups.length === 0 ? 'bookmarks' : null)
  const [iconKind, setIconKind] = useState<IconKind>(editing?.iconKind ?? 'favicon')
  const [iconColor, setIconColor] = useState(editing?.iconColor ?? 'terra')
  const [isFavorite, setFavorite] = useState(editing?.isFavorite ?? false)
  const [isTemporary, setTemporary] = useState(editing?.isTemporary ?? false)
  const [isPrivate, setPrivate] = useState(editing?.isPrivate ?? false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const lastPreviewed = useRef(editing?.url ?? '')
  const titleId = useId()
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    urlRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const runPreview = async () => {
    const u = url.trim()
    if (!u || u === lastPreviewed.current) return
    lastPreviewed.current = u
    setPreviewing(true)
    try {
      const p = await api.preview(u)
      setPreview(p)
      setFields((f) => ({ ...f, url: '' }))
      if (!nameTouched && p.title) setName(p.title)
      if (!p.faviconDataUrl && iconKind === 'favicon' && !editing?.iconUrl) setIconKind('initials')
      if (p.faviconDataUrl) setIconKind('favicon')
    } catch (e) {
      setPreview(null)
      if (e instanceof ApiError && e.fields.url) setFields((f) => ({ ...f, url: e.fields.url ?? '' }))
    } finally {
      setPreviewing(false)
    }
  }

  const duplicates = (preview?.duplicates ?? []).filter((d) => d.id !== editing?.id)

  const save = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setSaving(true)
    setBanner(null)
    const input: BookmarkInput = {
      name,
      url,
      groupId: newGroup === null ? groupId : null,
      newGroupName: newGroup,
      iconKind,
      iconColor,
      isFavorite,
      isTemporary,
      isPrivate,
    }
    try {
      if (editing) {
        await api.updateBookmark(editing.id, input)
        onSaved(`${name.trim()} saved`)
      } else {
        await api.createBookmark(input)
        onSaved(`${name.trim()} added`)
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        setFields(err.fields)
      } else {
        setBanner(
          err instanceof ApiError && err.status === 0
            ? "The site didn't answer. Your changes are still here, so try again."
            : `Something went wrong (${err instanceof Error ? err.message : 'unknown'}). Your changes are still here.`,
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const iconPreview = preview?.faviconDataUrl ?? (editing?.iconKind === 'favicon' ? editing.iconUrl : null)

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => void save(e)}
        noValidate
      >
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={titleId} className="kalam">
            {editing ? `edit ${editing.name}` : 'new bookmark'}
          </h2>
          <button type="button" className="link-btn" onClick={onClose}>
            cancel
          </button>
        </div>

        {banner && (
          <div className="banner bad" role="alert">
            <span aria-hidden="true">⚠</span>
            <div>
              <b>couldn't save that one</b>
              {banner}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="bm-url">URL</label>
          <input
            id="bm-url"
            ref={urlRef}
            className={`input${fields.url ? ' bad' : ''}`}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="http://192.168.5.100:3080"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
            }}
            onBlur={() => void runPreview()}
            aria-invalid={Boolean(fields.url)}
            aria-describedby="bm-url-msg"
          />
          <div id="bm-url-msg" className={fields.url ? 'err' : 'hint'}>
            {fields.url ||
              (previewing
                ? 'looking it up…'
                : preview
                  ? preview.title || preview.faviconDataUrl
                    ? `✓ found ${preview.title ? `"${preview.title}"` : 'it'}${preview.faviconDataUrl ? ' and its favicon' : ''}`
                    : 'no title or favicon found; that’s fine'
                  : 'paste it first: the name and icon fill in by themselves')}
          </div>
        </div>

        <div className="field">
          <label htmlFor="bm-name">Name</label>
          <input
            id="bm-name"
            className={`input${fields.name ? ' bad' : ''}`}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
            aria-invalid={Boolean(fields.name)}
          />
          {fields.name && <div className="err">{fields.name}</div>}
        </div>

        <fieldset className="field">
          <legend>Group{editing && <span className="soft"> (pick another to move it)</span>}</legend>
          <div className="chips">
            {groups.map((g) => (
              <button
                type="button"
                key={g.id}
                className={`chip t-${g.color}${newGroup === null && groupId === g.id ? ' on' : ''}`}
                aria-pressed={newGroup === null && groupId === g.id}
                onClick={() => {
                  setGroupId(g.id)
                  setNewGroup(null)
                }}
              >
                {g.name}
              </button>
            ))}
            {newGroup === null ? (
              <button
                type="button"
                className="chip new"
                onClick={() => {
                  setNewGroup('')
                }}
              >
                + new group
              </button>
            ) : (
              <input
                className="chip-input"
                aria-label="New group name"
                placeholder="group name"
                maxLength={40}
                value={newGroup}
                autoFocus={groups.length > 0}
                onChange={(e) => {
                  setNewGroup(e.target.value)
                }}
              />
            )}
          </div>
          {fields.groupId && <div className="err">{fields.groupId}</div>}
        </fieldset>

        <fieldset className="field">
          <legend>Icon</legend>
          <div className="icon-pick">
            <button
              type="button"
              className={`icon-opt${iconKind === 'favicon' ? ' on' : ''}`}
              aria-pressed={iconKind === 'favicon'}
              onClick={() => {
                setIconKind('favicon')
              }}
            >
              <span className="fav-icon" style={{ width: 30, height: 30 }}>
                {iconPreview ? (
                  <img src={iconPreview} alt="" width={18} height={18} />
                ) : (
                  <span className="soft">?</span>
                )}
              </span>
              favicon
            </button>
            <button
              type="button"
              className={`icon-opt${iconKind === 'initials' ? ' on' : ''}`}
              aria-pressed={iconKind === 'initials'}
              onClick={() => {
                setIconKind('initials')
              }}
            >
              <span className={`icon c-${iconColor}`} style={{ width: 30, height: 30, fontSize: 10.5 }}>
                {initials(name || '?')}
              </span>
              initials
            </button>
            <div
              className={`swatches${iconKind === 'initials' ? '' : ' dim'}`}
              role="radiogroup"
              aria-label="Icon color"
            >
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={iconColor === c}
                  aria-label={c}
                  className={`swatch c-${c}${iconColor === c ? ' on' : ''}`}
                  onClick={() => {
                    setIconColor(c)
                  }}
                />
              ))}
            </div>
          </div>
          <div className="hint">If no favicon is found, the tile uses initials on this color.</div>
        </fieldset>

        <div className="switches">
          <Switch label="Favorite" sub="pin to the top row" on={isFavorite} set={setFavorite} />
          <Switch
            label="Temporary"
            sub="sandbox or throwaway; tagged on the tile"
            on={isTemporary}
            set={setTemporary}
          />
          <Switch
            label="Private"
            sub="saved now; hidden from guests once login ships"
            on={isPrivate}
            set={setPrivate}
          />
        </div>

        {duplicates.length > 0 && (
          <div className="banner warnb">
            <span aria-hidden="true">↺</span>
            <div>
              <b>already on the board</b>
              {duplicates.map((d) => `"${d.name}" in ${d.groupName}`).join(', ')} uses this URL. Save anyway
              if you want both.
            </div>
          </div>
        )}

        <div className="form-actions">
          {editing && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmDelete(true)
              }}
            >
              delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost desk-only" onClick={onClose}>
            cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'saving…' : banner ? 'try again' : editing ? 'save changes' : 'add bookmark'}
          </button>
        </div>

        {confirmDelete && editing && (
          <div className="confirm-scrim">
            <div className="confirm" role="alertdialog" aria-labelledby="del-title">
              <div id="del-title" className="kalam">
                let {editing.name} go?
              </div>
              <p>It comes off everyone's board. You can undo for a few seconds afterwards.</p>
              <button
                type="button"
                className="btn primary red"
                onClick={() => {
                  onDelete(editing)
                }}
              >
                delete
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setConfirmDelete(false)
                }}
              >
                keep it
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

function Switch({
  label,
  sub,
  on,
  set,
}: {
  label: string
  sub: string
  on: boolean
  set: (v: boolean) => void
}) {
  return (
    <label className="sw">
      <span className="txt">
        <b>{label}</b>
        <span>{sub}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="toggle"
        checked={on}
        onChange={(e) => {
          set(e.target.checked)
        }}
      />
    </label>
  )
}
