/**
 * Agents panel for Hermes Desktop: helper agents under the sessions sidebar.
 *
 * Shows only what the sessions list cannot: the helper agents and background jobs running
 * under each chat, plus chats waiting on a question or approval. Empty when nothing runs.
 * Click a chat name to jump to it.
 *
 * Data: session.active_list, then subagent.list and process.list per live chat.
 */
import { Codicon, host, PALETTE_AREA, atom, useQuery, useValue } from '@hermes/plugin-sdk'
import { useState } from 'react'

const ID = 'agents-panel'
const $none = atom(null)
const st = name => host.state?.[name] || $none


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

function openChat(row, ev) {
  const key = row.session_key || row.id
  const intent = ev && (ev.metaKey || ev.ctrlKey) ? 'tab' : ev && ev.shiftKey ? 'window' : 'in-place'
  Promise.resolve(host.openSession?.(key, { intent })).catch(err =>
    host.notify?.({ kind: 'error', message: `Could not open chat: ${errorText(err)}` })
  )
}

// Every live chat that has something running under it, or is waiting for you.
async function loadRoster() {
  const rows = (await host.request('session.active_list', {}))?.sessions || []
  const out = []
  await Promise.all(
    rows.map(async row => {
      const [subs, procs] = await Promise.all([
        host.request('subagent.list', { session_id: row.id }).catch(() => null),
        host.request('process.list', { session_id: row.id }).catch(() => null)
      ])
      const agents = (subs?.subagents || []).filter(s => !ENDED.includes(String(s.status || '').toLowerCase()))
      const jobs = (procs?.processes || []).filter(p => !/exited|done|killed|finished/i.test(p.status || ''))
      const needs = String(row.status || '').toLowerCase() === 'waiting'
      if (needs || agents.length || jobs.length) out.push({ row, agents, jobs, needs })
    })
  )
  return out.sort((a, b) => Number(b.needs) - Number(a.needs) || (b.row.last_active || 0) - (a.row.last_active || 0))
}

function Line({ icon, color, text, right, title, mono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 18px', fontSize: 12, color: C.sub }} title={title}>
      <Codicon name={icon} size="0.8rem" style={{ color: color || C.muted, flexShrink: 0 }} />
      <span style={{ ...S.clip, flex: 1, fontFamily: mono ? 'var(--font-mono, monospace)' : undefined }}>{text}</span>
      {right ? <span style={S.num}>{right}</span> : null}
    </div>
  )
}

function Group({ item, now, focused }) {
  const [hover, setHover] = useState(false)
  const { row, agents, jobs, needs } = item
  return (
    <div style={{ paddingBottom: 4 }}>
      <div
        onClick={ev => openChat(row, ev)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: focused ? C.active : hover ? C.hover : 'transparent' }}
        title="Open this chat"
      >
        <span style={{ ...S.clip, flex: 1, fontSize: 11, color: C.muted }}>{row.title || row.preview || 'New chat'}</span>
        {needs ? <span style={{ fontSize: 11, color: C.amber, flexShrink: 0 }}>needs you</span> : null}
      </div>
      {agents.map(a => (
        <Line
          color={C.accent}
          icon="hubot"
          key={a.subagent_id}
          right={a.started_at ? fmtAge(now - a.started_at) : null}
          text={a.goal || 'Helper agent'}
          title={`${a.goal || 'Helper agent'}${a.model ? `\n${a.model}` : ''}${a.last_tool ? `\nlast: ${a.last_tool}` : ''}`}
        />
      ))}
      {jobs.map(p => (
        <Line icon="terminal" key={p.session_id || p.pid || p.command} mono right={p.uptime != null ? fmtAge(p.uptime) : null} text={p.command} title={p.command} />
      ))}
    </div>
  )
}

function AgentsPanel() {
  const busyMap = useValue(st('busyBySession')) || {}
  const focused = useValue(st('focusedSessionId'))
  const anyBusy = Object.values(busyMap).some(Boolean)
  const { data, error } = useQuery({ queryKey: [ID, 'roster'], refetchInterval: anyBusy ? 3000 : 8000, queryFn: loadRoster })
  const items = Array.isArray(data) ? data : []
  const now = Date.now() / 1000
  return (
    <div style={{ height: '100%', minHeight: 0, overflowY: 'auto', padding: '6px 4px' }}>
      {error ? <div style={{ padding: '4px 8px', fontSize: 12, color: C.red }}>{errorText(error)}</div> : null}
      {!items.length && !error ? <div style={{ padding: '4px 8px', fontSize: 12, color: C.faint }}>No agents running</div> : null}
      {items.map(i => (
        <Group focused={i.row.id === focused} item={i} key={i.row.id} now={now} />
      ))}
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
