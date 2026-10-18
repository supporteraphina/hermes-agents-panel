/**
 * Agents panel for Hermes Desktop: one list of every live chat under the sessions sidebar.
 *
 * Each chat shows whether it needs you (a question or approval is open), is working, has just
 * finished, or is idle, with its helper agents and background jobs nested underneath.
 * Chats that need you sort first. Click a chat to jump to it; ⌘ or Ctrl click opens it as a
 * tab so it can be dragged into a split next to the others.
 *
 * Data: session.active_list (every live chat in the backend), subagent.list and process.list
 * per chat, host.state.busyBySession for instant working state.
 */
import { Codicon, host, PALETTE_AREA, atom, useQuery, useValue } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'

const ID = 'agents-panel'
const $none = atom(null)
const st = name => host.state?.[name] || $none

// Chats that finished a turn since you last looked at them.
const $done = atom({})
const lastStatus = {}

const ENDED = ['completed', 'failed', 'interrupted', 'cancelled', 'error']

const C = {
  text: 'var(--ui-text-primary, var(--foreground))',
  sub: 'var(--ui-text-secondary)',
  muted: 'var(--ui-text-tertiary)',
  faint: 'var(--ui-text-quaternary)',
  accent: 'var(--ui-accent)',
  amber: 'var(--ui-amber, #f59e0b)',
  green: 'var(--ui-green, #55a583)',
  red: 'var(--ui-red, #e75e78)',
  hover: 'var(--ui-row-hover-background, rgb(255 255 255 / 0.05))',
  active: 'var(--ui-row-active-background, rgb(255 255 255 / 0.08))'
}

const S = {
  clip: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  num: { fontVariantNumeric: 'tabular-nums', color: C.faint, fontSize: 11, flexShrink: 0 }
}

const errorText = err => (err instanceof Error ? err.message : String(err?.message ?? err))

function fmtAge(seconds) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const shortModel = m =>
  String(m || '')
    .split('/')
    .pop()
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')

// needs-you > working > done > idle
function stateOf(row, busyMap, done) {
  const status = String(row.status || '').toLowerCase()
  if (status === 'waiting') return 'needs'
  if (busyMap?.[row.id] || ['working', 'streaming', 'starting', 'resuming'].includes(status)) return 'working'
  if (done[row.id]) return 'done'
  return 'idle'
}

const STATE = {
  needs: { color: C.amber, label: 'Needs you', rank: 0, fill: true },
  working: { color: C.accent, label: 'Working', rank: 1, fill: true },
  done: { color: C.green, label: 'Done', rank: 2, fill: true },
  idle: { color: C.faint, label: 'Idle', rank: 3, fill: false }
}

function Dot({ state }) {
  const s = STATE[state]
  return (
    <span
      style={{
        display: 'block',
        width: 7,
        height: 7,
        borderRadius: 99,
        flexShrink: 0,
        background: s.fill ? s.color : 'transparent',
        border: s.fill ? 'none' : `1px solid ${s.color}`,
        boxSizing: 'border-box',
        boxShadow: state === 'working' || state === 'needs' ? `0 0 0 3px color-mix(in srgb, ${s.color} 22%, transparent)` : 'none'
      }}
      title={s.label}
    />
  )
}

function openChat(row, ev) {
  const key = row.session_key || row.id
  const intent = ev && (ev.metaKey || ev.ctrlKey) ? 'tab' : ev && ev.shiftKey ? 'window' : 'in-place'
  $done.set({ ...$done.get(), [row.id]: false })
  Promise.resolve(host.openSession?.(key, { intent })).catch(err =>
    host.notify?.({ kind: 'error', message: `Could not open chat: ${errorText(err)}` })
  )
}

function useHelpers(sid, live) {
  return useQuery({
    queryKey: [ID, 'helpers', sid],
    enabled: Boolean(sid),
    refetchInterval: live ? 3000 : 15000,
    queryFn: async () => {
      const [subs, procs] = await Promise.all([
        host.request('subagent.list', { session_id: sid }).catch(() => null),
        host.request('process.list', { session_id: sid }).catch(() => null)
      ])
      const agents = (subs?.subagents || []).filter(s => !ENDED.includes(String(s.status || '').toLowerCase()))
      const jobs = (procs?.processes || []).filter(p => !/exited|done|killed|finished/i.test(p.status || ''))
      return { agents, jobs }
    }
  })
}

function ChatRow({ row, state, focused, now }) {
  const [hover, setHover] = useState(false)
  const { data } = useHelpers(row.id, state === 'working' || state === 'needs')
  const agents = data?.agents || []
  const jobs = data?.jobs || []
  const title = row.title || row.preview || 'New chat'
  const right = state === 'idle' || state === 'done' ? fmtAge(now - (row.last_active || now)) : STATE[state].label
  return (
    <div>
      <div
        onClick={ev => openChat(row, ev)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          borderRadius: 6,
          cursor: 'pointer',
          background: focused ? C.active : hover ? C.hover : 'transparent'
        }}
        title={`${title}\n${STATE[state].label}${row.model ? ` · ${row.model}` : ''}\nClick to open, ⌘ click for a new tab, ⇧ click for a window`}
      >
        <Dot state={state} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...S.clip, fontSize: 12.5, color: state === 'idle' ? C.sub : C.text }}>{title}</div>
          {state === 'working' || state === 'needs' ? (
            <div style={{ ...S.clip, fontSize: 11, color: C.muted }}>
              {[shortModel(row.model), agents.length ? `${agents.length} helper${agents.length > 1 ? 's' : ''}` : null, jobs.length ? `${jobs.length} job${jobs.length > 1 ? 's' : ''}` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          ) : null}
        </div>
        <span style={{ ...S.num, color: state === 'needs' ? C.amber : S.num.color }}>{right}</span>
      </div>
      {agents.map(a => (
        <div
          key={a.subagent_id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 22px', fontSize: 11.5, color: C.sub }}
          title={`${a.goal || 'Helper agent'}${a.model ? `\n${a.model}` : ''}${a.last_tool ? `\nlast: ${a.last_tool}` : ''}`}
        >
          <Codicon name="hubot" size="0.8rem" style={{ color: C.accent, flexShrink: 0 }} />
          <span style={{ ...S.clip, flex: 1 }}>{a.goal || 'Helper agent'}</span>
          <span style={S.num}>
            {[a.tool_count != null ? `${a.tool_count}t` : null, a.started_at ? fmtAge(now - a.started_at) : null].filter(Boolean).join(' ')}
          </span>
        </div>
      ))}
      {jobs.map(p => (
        <div
          key={p.session_id || p.pid || p.command}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 22px', fontSize: 11.5, color: C.muted }}
          title={p.command}
        >
          <Codicon name="terminal" size="0.8rem" style={{ flexShrink: 0 }} />
          <span style={{ ...S.clip, flex: 1, fontFamily: 'var(--font-mono, monospace)' }}>{p.command}</span>
          {p.uptime != null ? <span style={S.num}>{fmtAge(p.uptime)}</span> : null}
        </div>
      ))}
    </div>
  )
}

function AgentsPanel() {
  const busyMap = useValue(st('busyBySession')) || {}
  const focused = useValue(st('focusedSessionId'))
  const done = useValue($done)
  const [showIdle, setShowIdle] = useState(false)
  const [now, setNow] = useState(Date.now() / 1000)
  const anyBusy = Object.values(busyMap).some(Boolean)

  const { data, error } = useQuery({
    queryKey: [ID, 'live'],
    refetchInterval: anyBusy ? 2500 : 6000,
    queryFn: async () => (await host.request('session.active_list', {}))?.sessions || []
  })

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 15000)
    return () => clearInterval(t)
  }, [])

  // A chat that goes from working to idle while you look elsewhere is "Done" until you open it.
  const rows = Array.isArray(data) ? data : []
  useEffect(() => {
    const next = { ...$done.get() }
    let changed = false
    for (const r of rows) {
      const working = Boolean(busyMap[r.id]) || ['working', 'streaming', 'waiting'].includes(String(r.status))
      if (lastStatus[r.id] === true && !working && r.id !== focused && !next[r.id]) {
        next[r.id] = true
        changed = true
      }
      lastStatus[r.id] = working
    }
    if (focused && next[focused]) {
      next[focused] = false
      changed = true
    }
    if (changed) $done.set(next)
  }, [rows, busyMap, focused])

  const items = rows
    .map(r => ({ row: r, state: stateOf(r, busyMap, done) }))
    .sort((a, b) => STATE[a.state].rank - STATE[b.state].rank || (b.row.last_active || 0) - (a.row.last_active || 0))
  const active = items.filter(i => i.state !== 'idle')
  const idle = items.filter(i => i.state === 'idle')
  const counts = { needs: 0, working: 0, done: 0 }
  for (const i of active) counts[i.state] += 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px 4px', fontSize: 11, color: C.muted }}>
        {counts.needs ? <span style={{ color: C.amber }}>{counts.needs} need you</span> : null}
        {counts.working ? <span style={{ color: C.accent }}>{counts.working} working</span> : null}
        {counts.done ? <span style={{ color: C.green }}>{counts.done} done</span> : null}
        {!active.length ? <span>Nothing running</span> : null}
        <span style={{ marginLeft: 'auto' }}>{rows.length} live</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 4px 6px' }}>
        {error ? <div style={{ padding: '4px 8px', fontSize: 12, color: C.red }}>{errorText(error)}</div> : null}
        {active.map(i => (
          <ChatRow focused={i.row.id === focused} key={i.row.id} now={now} row={i.row} state={i.state} />
        ))}
        {idle.length ? (
          <button
            onClick={() => setShowIdle(!showIdle)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 0, padding: '6px 8px 2px', fontSize: 11, color: C.faint, cursor: 'pointer' }}
            type="button"
          >
            <Codicon name={showIdle ? 'chevron-down' : 'chevron-right'} size="0.7rem" />
            Idle {idle.length}
          </button>
        ) : null}
        {showIdle
          ? idle.map(i => <ChatRow focused={i.row.id === focused} key={i.row.id} now={now} row={i.row} state={i.state} />)
          : null}
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
            const busy = host.state?.busyBySession?.get?.() || {}
            const done = $done.get()
            const pick =
              rows.find(r => String(r.status) === 'waiting') || rows.find(r => done[r.id]) || rows.find(r => busy[r.id])
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
