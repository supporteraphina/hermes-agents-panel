/**
 * Agents panel for Hermes Desktop: helper agents under the sessions sidebar.
 *
 * Shows only what the sessions list cannot: the helper agents running under each chat, plus
 * chats waiting on a question or approval. Styled with the sidebar's own row classes.
 * Click a chat name to jump to it.
 *
 * Data: session.active_list, then subagent.list per live chat.
 */
import { host, PALETTE_AREA, atom, useQuery, useValue } from '@hermes/plugin-sdk'

const ID = 'agents-panel'
const $none = atom(null)
const st = name => host.state?.[name] || $none

const ENDED = ['completed', 'failed', 'interrupted', 'cancelled', 'error']

const errorText = err => (err instanceof Error ? err.message : String(err?.message ?? err))

function fmtAge(seconds) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function openChat(row, ev) {
  const key = row.session_key || row.id
  const intent = ev && (ev.metaKey || ev.ctrlKey) ? 'tab' : ev && ev.shiftKey ? 'window' : 'in-place'
  Promise.resolve(host.openSession?.(key, { intent })).catch(err =>
    host.notify?.({ kind: 'error', message: `Could not open chat: ${errorText(err)}` })
  )
}

// Live chats that have helper agents running under them, or are waiting on your answer.
async function loadRoster() {
  const rows = (await host.request('session.active_list', {}))?.sessions || []
  const out = []
  await Promise.all(
    rows.map(async row => {
      const subs = await host.request('subagent.list', { session_id: row.id }).catch(() => null)
      const agents = (subs?.subagents || []).filter(s => !ENDED.includes(String(s.status || '').toLowerCase()))
      const needs = String(row.status || '').toLowerCase() === 'waiting'
      if (needs || agents.length) out.push({ row, agents, needs })
    })
  )
  return out.sort((a, b) => Number(b.needs) - Number(a.needs) || (b.row.last_active || 0) - (a.row.last_active || 0))
}

// Same classes as the app's own sidebar rows and section labels, so the skin styles both alike.
const ROW = 'flex min-h-[1.625rem] min-w-0 items-center gap-1.5 rounded-md pl-2 pr-2 py-0.5'
const LABEL = 'min-w-0 flex-1 truncate leading-[1.35] text-[0.8125rem]'
const AGE = 'shrink-0 text-[0.6875rem] tabular-nums text-(--ui-text-quaternary)'

function Header({ count }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5">
      <span className="flex min-w-0 items-center gap-2 pl-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)">
        <span aria-hidden="true" className="dither inline-block size-2 shrink-0 rounded-[1px]" />
        <span className="min-w-0 truncate leading-none">Agents</span>
      </span>
      {count ? <span className={`${AGE} pr-2`}>{count}</span> : null}
    </div>
  )
}

function Group({ item, now, focused }) {
  const { row, agents, needs } = item
  return (
    <>
      <div
        className={`${ROW} cursor-pointer hover:bg-(--ui-row-hover-background) ${focused ? 'bg-(--ui-row-active-background)' : ''}`}
        onClick={ev => openChat(row, ev)}
        title="Open this chat"
      >
        <span className="grid size-3.5 shrink-0 place-items-center">
          <span className={`size-1.5 rounded-full ${needs ? 'bg-amber-500' : 'bg-(--ui-accent)'}`} />
        </span>
        <span className={`${LABEL} text-(--ui-text-secondary)`}>{row.title || row.preview || 'New chat'}</span>
        {needs ? <span className="shrink-0 text-[0.6875rem] text-amber-500">needs you</span> : null}
      </div>
      {agents.map(a => (
        <div
          className={ROW}
          key={a.subagent_id}
          title={`${a.goal || 'Helper agent'}${a.model ? `\n${a.model}` : ''}${a.last_tool ? `\nlast: ${a.last_tool}` : ''}`}
        >
          <span className="grid size-3.5 shrink-0 place-items-center" />
          <span className={`${LABEL} text-(--ui-text-tertiary)`}>{`› ${a.goal || 'Helper agent'}`}</span>
          {a.started_at ? <span className={AGE}>{fmtAge(now - a.started_at)}</span> : null}
        </div>
      ))}
    </>
  )
}

function AgentsPanel() {
  const busyMap = useValue(st('busyBySession')) || {}
  const focused = useValue(st('focusedSessionId'))
  const anyBusy = Object.values(busyMap).some(Boolean)
  const { data } = useQuery({ queryKey: [ID, 'roster'], refetchInterval: anyBusy ? 3000 : 8000, queryFn: loadRoster })
  const items = Array.isArray(data) ? data : []
  const count = items.reduce((n, i) => n + i.agents.length, 0)
  const now = Date.now() / 1000
  return (
    <div className="flex h-full min-h-0 flex-col px-2 pt-1">
      <Header count={count} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length ? (
          items.map(i => <Group focused={i.row.id === focused} item={i} key={i.row.id} now={now} />)
        ) : (
          <div className={ROW}>
            <span className="grid size-3.5 shrink-0 place-items-center" />
            <span className={`${LABEL} text-(--ui-text-quaternary)`}>None running</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default {
  id: ID,
  name: 'Agents panel',
  register(ctx) {
    ctx.register({
      id: 'pane',
      area: 'panes',
      title: 'Agents',
      data: { placement: 'left', dock: { pane: 'sessions', pos: 'bottom' }, height: '300px' },
      render: () => <AgentsPanel />
    })

    ctx.register({
      id: 'palette',
      area: PALETTE_AREA,
      data: {
        id: 'agents-panel.next',
        label: 'Jump to the next chat that needs me',
        keywords: ['agents', 'waiting', 'blocked', 'needs', 'next'],
        run: async () => {
          try {
            const rows = (await host.request('session.active_list', {}))?.sessions || []
            const pick = rows.find(r => String(r.status) === 'waiting')
            if (pick) openChat(pick)
            else host.notify?.({ kind: 'info', message: 'No chat needs you right now.' })
          } catch (err) {
            host.notify?.({ kind: 'error', message: errorText(err) })
          }
        }
      }
    })
  }
}
