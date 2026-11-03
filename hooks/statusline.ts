import type { EngineInterface } from 'claude-code'

// How much of the footer the person's status line takes. Claude Code does not
// show a mod the status line, so this runs the configured statusLine command the
// way Claude Code does (same JSON shape on stdin, as close as the plugin API
// allows) and measures what it prints.
export type StatusLineFit = {
  // Widest printed line, in terminal cells, padding included.
  columns: number
  // Lines printed.
  lines: number
}

type StatusLineSetting = { type?: unknown; command?: unknown; padding?: unknown }

// No statusLine command configured: null. Could not run it: undefined.
export async function measureStatusLine(
  $: EngineInterface,
  cwd: string,
  columns: number,
): Promise<StatusLineFit | null | undefined> {
  const setting = (await $.settings.read({ key: 'statusLine' })) as StatusLineSetting | undefined
  if (!setting || setting.type !== 'command' || typeof setting.command !== 'string') {
    return null
  }
  const padding = typeof setting.padding === 'number' ? setting.padding : 0
  const stdin = JSON.stringify(await statusInput($, cwd))
  const result = await $.process.run(['/bin/sh', '-c', setting.command], {
    stdin,
    timeoutMs: 5000,
    env: { COLUMNS: String(columns) },
  })
  if (result.exitCode !== 0) {
    return undefined
  }
  const printed = result.stdout.replace(/\n+$/, '').split('\n')
  return {
    columns: padding + Math.max(0, ...printed.map(cellWidth)),
    lines: printed.length,
  }
}

async function statusInput($: EngineInterface, cwd: string): Promise<unknown> {
  const [usage, model, sessionId] = await Promise.all([
    $.session.usage(),
    $.session.model().catch(() => ''),
    $.session.id().catch(() => ''),
  ])
  const window = (kind: string) => {
    const limit = usage.rateLimits.find(item => item.kind === kind)
    return limit
      ? {
          used_percentage: limit.percentUsed,
          resets_at: limit.resetsAt ? Math.floor(Date.parse(limit.resetsAt) / 1000) : undefined,
        }
      : undefined
  }
  return {
    hook_event_name: 'Status',
    session_id: sessionId,
    cwd,
    workspace: { current_dir: cwd, project_dir: cwd },
    model: { id: model, display_name: model },
    cost: {
      total_cost_usd: usage.cost?.usd ?? 0,
      total_duration_ms: Date.now() - usage.startedAt,
    },
    context_window: {
      used_percentage: usage.context.percent,
      context_window_size: usage.context.window,
      total_input_tokens: usage.context.tokens,
    },
    rate_limits: { five_hour: window('five_hour'), seven_day: window('seven_day') },
  }
}

// Escape sequences: CSI (colours, cursor), OSC (links, titles) and lone ESC pairs.
const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g
const ZERO_WIDTH = /[̀-ͯ​-‏⃐-⃿︀-️\u{e0100}-\u{e01ef}]/u

// Terminal cells a printed line takes: escapes take none, emoji and East Asian
// wide characters take two.
export function cellWidth(line: string): number {
  let width = 0
  for (const char of line.replace(ESCAPES, '')) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || ZERO_WIDTH.test(char)) {
      continue
    }
    width += isWide(code) ? 2 : 1
  }
  return width
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x231a && code <= 0x231b) ||
    (code >= 0x23e9 && code <= 0x23ec) ||
    code === 0x23f0 ||
    code === 0x23f3 ||
    (code >= 0x25fd && code <= 0x25fe) ||
    (code >= 0x2614 && code <= 0x2615) ||
    (code >= 0x2648 && code <= 0x2653) ||
    code === 0x267f ||
    code === 0x2693 ||
    code === 0x26a1 ||
    (code >= 0x26aa && code <= 0x26ab) ||
    (code >= 0x26bd && code <= 0x26be) ||
    (code >= 0x26c4 && code <= 0x26c5) ||
    code === 0x26ce ||
    code === 0x26d4 ||
    code === 0x26ea ||
    (code >= 0x26f2 && code <= 0x26f5) ||
    code === 0x26fa ||
    code === 0x26fd ||
    code === 0x2705 ||
    (code >= 0x270a && code <= 0x270b) ||
    code === 0x2728 ||
    code === 0x274c ||
    code === 0x274e ||
    (code >= 0x2753 && code <= 0x2755) ||
    code === 0x2757 ||
    (code >= 0x2795 && code <= 0x2797) ||
    code === 0x27b0 ||
    code === 0x27bf ||
    (code >= 0x2b1b && code <= 0x2b1c) ||
    code === 0x2b50 ||
    code === 0x2b55 ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f680 && code <= 0x1f6ff) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x1fa70 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}
