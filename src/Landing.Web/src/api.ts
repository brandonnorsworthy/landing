// Typed client for the landing API (same origin). Shapes mirror src/Landing.Api/Endpoints/Contracts.cs.

export type GroupKind = 'normal' | 'external'
export type IconKind = 'initials' | 'favicon'
export type LinkStatus = 'unknown' | 'up' | 'warning' | 'down'

export interface Bookmark {
  id: number
  groupId: number
  name: string
  url: string
  iconKind: IconKind
  iconColor: string
  iconUrl: string | null
  isFavorite: boolean
  isTemporary: boolean
  isPrivate: boolean
  sortOrder: number
  status: LinkStatus
  statusDetail: string | null
  responseMs: number | null
  lastCheckedAt: string | null
  statusSince: string | null
}

export interface Group {
  id: number
  name: string
  kind: GroupKind
  color: string
  sortOrder: number
  bookmarks: Bookmark[]
}

export interface Board {
  groups: Group[]
  checker: { lastRunAt: string | null; intervalSeconds: number }
  version: string
}

export interface BookmarkInput {
  name: string
  url: string
  groupId: number | null
  newGroupName: string | null
  iconKind: IconKind
  iconColor: string
  isFavorite: boolean
  isTemporary: boolean
  isPrivate: boolean
}

export interface Preview {
  title: string | null
  faviconDataUrl: string | null
  duplicates: { id: number; name: string; groupName: string }[]
}

/** Field errors from a 400 (keys are camelCase field names), or a general failure. */
export class ApiError extends Error {
  readonly fields: Record<string, string>
  readonly status: number

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

interface ProblemBody {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "The site didn't answer.")
  }

  if (res.ok) {
    if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
    return (await res.json()) as T
  }

  let problem: ProblemBody = {}
  try {
    problem = (await res.json()) as ProblemBody
  } catch {
    // not JSON; fall through with the status alone
  }
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(problem.errors ?? {})) {
    const first = v[0]
    if (first) fields[k.charAt(0).toLowerCase() + k.slice(1)] = first
  }
  throw new ApiError(res.status, problem.detail ?? problem.title ?? `HTTP ${res.status}`, fields)
}

export const api = {
  board: () => request<Board>('GET', '/api/board'),
  preview: (url: string) => request<Preview>('POST', '/api/preview', { url }),
  createBookmark: (input: BookmarkInput) => request<{ id: number }>('POST', '/api/bookmarks', input),
  updateBookmark: (id: number, input: BookmarkInput) =>
    request<undefined>('PUT', `/api/bookmarks/${id}`, input),
  deleteBookmark: (id: number) => request<undefined>('DELETE', `/api/bookmarks/${id}`),
  restoreBookmark: (id: number) => request<undefined>('POST', `/api/bookmarks/${id}/restore`),
  moveBookmark: (id: number, groupId: number, index: number) =>
    request<undefined>('POST', `/api/bookmarks/${id}/move`, { groupId, index }),
  createGroup: (name: string, kind: GroupKind, color: string) =>
    request<{ id: number }>('POST', '/api/groups', { name, kind, color }),
  updateGroup: (id: number, name: string, color: string) =>
    request<undefined>('PUT', `/api/groups/${id}`, { name, color }),
  deleteGroup: (id: number) => request<undefined>('DELETE', `/api/groups/${id}`),
  reorderGroups: (ids: number[]) => request<undefined>('POST', '/api/groups/reorder', { ids }),
}
