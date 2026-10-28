import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput, Timer } from 'claude-code'

import type { Language, Placement, PokemonSize, RenderMode, PokemonSettings, TeamMember } from '../types'
import { blank, draw, rasterCells, resample, ALERT, HAPPY, HEART, POKEBALL } from './pixels'
import type { Bitmap } from './pixels'
import {
  findPokemon,
  localName,
  pokedexEntry,
  randomPokemon,
  LANGUAGES,
  NICKNAMES,
  POKEDEX,
} from './pokedex-lookup'
import { frameAt, loadSpriteSet } from './sprites'
import type { SpriteSet } from './sprites'
import { celebrate, monAt, newMon, step, swipe, TICK_MS } from './world'
import type { BubbleKind, Mon, World } from './world'

const PLUGIN = 'pokemon-footer'
const STRIP = 'pokemon'
const HOVER = 'hover'
const SIZES: readonly PokemonSize[] = ['nano', 'small', 'medium', 'large']
const SIZE_FRACTION: Record<PokemonSize, number> = { nano: 0.55, small: 0.7, medium: 0.85, large: 1 }
// World pixels per cell column: one for half-block cells, more for real images.
const IMAGE_SCALE = 3
const MAX_TEAM = 12

const DEFAULT_SETTINGS: PokemonSettings = {
  size: 'medium',
  rows: 7,
  width: 48,
  place: 'footer',
  render: 'auto',
  shinyOdds: 8192,
  language: 'en',
  hover: true,
}

const settingsAtom = atom({ plugin: 'pokemon-footer', key: 'settings' } as const, DEFAULT_SETTINGS, {
  shape: 'settings-1',
})
const teamAtom = atom({ plugin: 'pokemon-footer', key: 'team' } as const, [], { shape: 'team-1' })
const rasterForcedAtom = atom({ plugin: 'pokemon-footer', key: 'isRasterForced' } as const, false, {
  shape: 'raster-forced-1',
})

type Geometry = {
  site: string
  columns: number
  rows: number
  scale: number
  isImage: boolean
}

const world: World = { width: 48, spriteHeight: 12, mood: 'idle', mons: [] }
const spriteSets = new Map<string, SpriteSet>()
let geometry: Geometry | undefined
let ticker: Timer | undefined

function spriteKey(mon: Pick<Mon, 'key' | 'shiny'>, height: number): string {
  return `${mon.key}/${mon.shiny}/${height}`
}

function isRaster(settings: PokemonSettings, isRasterForced: boolean): boolean {
  return settings.render === 'raster' || (settings.render === 'auto' && isRasterForced)
}

function scaleArt(art: Bitmap, scale: number): Bitmap {
  return scale === 1 ? art : resample(art, art.width * scale, art.height * scale)
}

const BUBBLES: Record<BubbleKind, Bitmap> = { happy: HAPPY, heart: HEART, alert: ALERT }

function compose(g: Geometry): Bitmap {
  const frame = blank(g.columns * g.scale, g.rows * 2 * g.scale)
  const artScale = Math.max(1, Math.round(world.spriteHeight / 14))
  for (const mon of world.mons) {
    const set = spriteSets.get(spriteKey(mon, world.spriteHeight))
    let sprite: Bitmap
    if (!set || mon.spawnTicks > 0) {
      sprite = scaleArt(POKEBALL, artScale)
    } else {
      const isWalking = mon.motion === 'walkLeft' || mon.motion === 'walkRight'
      const animation = isWalking
        ? mon.facingLeft
          ? set.walkLeft
          : set.walk
        : mon.facingLeft
          ? set.idleLeft
          : set.idle
      sprite = frameAt(animation, mon.animMs)
    }
    const top = frame.height - sprite.height
    draw(frame, sprite, mon.x + (mon.width - sprite.width) / 2, top)
    if (mon.bubble) {
      const bubble = scaleArt(BUBBLES[mon.bubble.kind], artScale)
      draw(frame, bubble, mon.x + mon.width - bubble.width / 2, Math.max(0, top - bubble.height / 2))
    }
  }
  return frame
}

function newUid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function pickNickname(team: readonly TeamMember[]): string {
  const taken = new Set(team.map(member => member.nickname))
  const free = NICKNAMES.filter(name => !taken.has(name))
  return free[Math.floor(Math.random() * free.length)] ?? `Buddy ${team.length + 1}`
}

// Brings the running world in line with the saved team and the drawn size.
async function syncWorld($: EngineInterface): Promise<void> {
  const [settings, team] = await Promise.all([read($, settingsAtom), read($, teamAtom)])
  const g = geometry
  if (g) {
    world.width = g.columns * g.scale
    world.spriteHeight = Math.max(4, Math.round(g.rows * 2 * g.scale * SIZE_FRACTION[settings.size]))
  }
  const wanted = new Map(team.map(member => [member.uid, member]))
  world.mons = world.mons.filter(mon => wanted.has(mon.uid))
  for (const member of team) {
    if (!world.mons.some(mon => mon.uid === member.uid)) {
      world.mons.push(newMon(member, world, Math.random))
    }
  }
  for (const mon of world.mons) {
    const member = wanted.get(mon.uid)
    if (member) {
      mon.nickname = member.nickname
    }
    const entry = pokedexEntry(mon.key)
    const key = spriteKey(mon, world.spriteHeight)
    const set = spriteSets.get(key)
    if (set) {
      mon.width = set.width
    } else if (entry) {
      void loadSpriteSet($, entry, mon.shiny, world.spriteHeight)
        .then(loaded => {
          spriteSets.set(key, loaded)
          mon.width = loaded.width
        })
        .catch(error => $.ui.log(`${PLUGIN}: ${String(error)}`, { to: 'debug' }))
    }
  }
}

async function tick($: EngineInterface): Promise<void> {
  step(world, Math.random)
  const g = geometry
  if (!g || world.mons.length === 0) {
    return
  }
  const frame = compose(g)
  const result = g.isImage
    ? await $.ui.blit({
        requestId: g.site,
        key: STRIP,
        source: { rgba: frame.rgba.toBase64(), width: frame.width, height: frame.height },
      })
    : await $.ui.blit({ requestId: g.site, key: STRIP, cells: rasterCells(frame) })
  // This terminal draws no images: fall back to half-block cells for good.
  if (g.isImage && result.deny?.includes('alt')) {
    await update($, rasterForcedAtom, () => true)
  }
}

function startTicker($: EngineInterface): void {
  ticker?.cancel()
  ticker = $.clock.every(TICK_MS, () => void tick($))
}

async function saveTeam($: EngineInterface, team: TeamMember[]): Promise<void> {
  await update($, teamAtom, () => team)
  await $.store.set('team', team)
  await syncWorld($)
}

async function saveSettings($: EngineInterface, change: Partial<PokemonSettings>): Promise<PokemonSettings> {
  const next = { ...(await read($, settingsAtom)), ...change }
  await update($, settingsAtom, () => next)
  await $.store.set('settings', next)
  return next
}

function describe(member: TeamMember, language: Language): string {
  const entry = pokedexEntry(member.key)
  const species = entry ? localName(entry, language) : member.key
  return `${member.nickname} (${member.shiny ? '✨ shiny ' : ''}${species})`
}

const HELP = [
  'Usage: /pokemon <command>',
  '  spawn <pokémon|random> [shiny] [as <nickname>]   e.g. /pokemon spawn pikachu as Sparky',
  '  random [gen 1-5]          spawn a random Pokémon',
  '  remove <nickname|pokémon> | clear',
  '  list | roll-call | pet [nickname] | find <text>',
  '  size nano|small|medium|large   rows <3-24>   width <12-240>',
  '  place footer|band         footer: beside the status line; band: full width above the prompt',
  '  render auto|image|raster  shiny-odds <n>   language en|fr|de|ja   hover on|off',
  '  export [file] | import <file>',
].join('\n')

async function spawn(
  $: EngineInterface,
  key: string,
  options: { shiny?: boolean; nickname?: string },
): Promise<string> {
  const [team, settings] = await Promise.all([read($, teamAtom), read($, settingsAtom)])
  if (team.length >= MAX_TEAM) {
    return `Your team is full (${MAX_TEAM}). Remove one with /pokemon remove <nickname>.`
  }
  const entry = pokedexEntry(key)
  if (!entry) {
    return `No Pokémon "${key}".`
  }
  const rolledShiny = Math.random() < 1 / Math.max(1, settings.shinyOdds)
  const member: TeamMember = {
    uid: newUid(),
    key,
    nickname: options.nickname?.trim() || pickNickname(team),
    shiny: entry.hasShiny && (options.shiny ?? rolledShiny),
  }
  await saveTeam($, [...team, member])
  return `${describe(member, settings.language)} joined the team!`
}

async function runCommand($: EngineInterface, args: string): Promise<string> {
  const [verb = 'help', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const tail = rest.join(' ')
  const [team, settings] = await Promise.all([read($, teamAtom), read($, settingsAtom)])
  switch (verb.toLowerCase()) {
    case 'help':
      return HELP
    case 'spawn':
    case 'add': {
      const match = /^(.*?)(?:\s+(shiny))?(?:\s+(?:as|named)\s+(.+))?$/i.exec(tail)
      const query = match?.[1]?.trim() ?? ''
      if (query === '' || query.toLowerCase() === 'random') {
        return spawn($, randomPokemon(Math.random).key, { nickname: match?.[3] })
      }
      const entry = findPokemon(query)
      if (!entry) {
        return `No Pokémon matches "${query}". Try /pokemon find ${query}.`
      }
      return spawn($, entry.key, {
        shiny: match?.[2] ? true : undefined,
        nickname: match?.[3],
      })
    }
    case 'random': {
      const gen = /gen\s*([1-5])/i.exec(tail)?.[1]
      return spawn($, randomPokemon(Math.random, gen ? Number(gen) : undefined).key, {})
    }
    case 'remove':
    case 'delete': {
      const wanted = tail.toLowerCase()
      const entry = findPokemon(tail)
      const target =
        team.find(member => member.nickname.toLowerCase() === wanted) ??
        team.find(member => member.key === entry?.key)
      if (!target) {
        return `No team member "${tail}". /pokemon list shows the team.`
      }
      await saveTeam($, team.filter(member => member.uid !== target.uid))
      return `${describe(target, settings.language)} went back in its Poké Ball.`
    }
    case 'clear':
      await saveTeam($, [])
      return 'Every Pokémon went back in its Poké Ball.'
    case 'list':
      return team.length === 0
        ? 'No Pokémon yet. Try /pokemon random.'
        : team.map(member => `• ${describe(member, settings.language)}`).join('\n')
    case 'roll-call':
      return team.length === 0
        ? 'Nobody answers. Try /pokemon random.'
        : team.map(member => `${describe(member, settings.language)} says hello 👋!`).join('\n')
    case 'pet': {
      const target = tail
        ? world.mons.find(mon => mon.nickname.toLowerCase() === tail.toLowerCase())
        : world.mons[Math.floor(Math.random() * world.mons.length)]
      if (!target) {
        return tail ? `No team member "${tail}".` : 'No Pokémon to pet.'
      }
      swipe(target)
      return `You pet ${target.nickname}. 💛`
    }
    case 'find': {
      const wanted = tail.toLowerCase()
      const hits = POKEDEX.filter(
        entry =>
          entry.key.includes(wanted) ||
          entry.name.toLowerCase().includes(wanted) ||
          Object.values(entry.names).some(name => name.toLowerCase().includes(wanted)),
      ).slice(0, 30)
      return hits.length === 0
        ? `No Pokémon matches "${tail}".`
        : hits.map(entry => `${localName(entry, settings.language)} (gen ${entry.generation})`).join(', ')
    }
    case 'size': {
      if (!SIZES.some(size => size === tail)) {
        return `Sizes: ${SIZES.join(', ')}.`
      }
      await saveSettings($, { size: SIZES.find(size => size === tail) })
      await syncWorld($)
      return `Size: ${tail}.`
    }
    case 'rows':
    case 'width': {
      const [min, max] = verb === 'rows' ? [3, 24] : [12, 240]
      const value = Number(tail)
      if (!Number.isInteger(value) || value < min || value > max) {
        return `${verb} takes a whole number from ${min} to ${max}.`
      }
      await saveSettings($, verb === 'rows' ? { rows: value } : { width: value })
      return `${verb}: ${value}.`
    }
    case 'place': {
      const places: readonly Placement[] = ['footer', 'band']
      const place = places.find(option => option === tail)
      if (!place) {
        return 'place footer (beside the status line) or place band (full width above the prompt).'
      }
      await saveSettings($, { place })
      geometry = undefined
      return `Place: ${place}.`
    }
    case 'render': {
      const modes: readonly RenderMode[] = ['auto', 'image', 'raster']
      const render = modes.find(option => option === tail)
      if (!render) {
        return 'render auto, image (kitty, Ghostty, iTerm2) or raster (any terminal).'
      }
      await saveSettings($, { render })
      await update($, rasterForcedAtom, () => false)
      return `Render: ${render}.`
    }
    case 'shiny-odds': {
      const odds = Number(tail)
      if (!Number.isFinite(odds) || odds < 1) {
        return 'shiny-odds takes N for 1-in-N odds (default 8192).'
      }
      await saveSettings($, { shinyOdds: Math.round(odds) })
      return `Shiny odds: 1 in ${Math.round(odds)}.`
    }
    case 'language': {
      const language = LANGUAGES.find(option => option === tail)
      if (!language) {
        return `Languages: ${LANGUAGES.join(', ')}.`
      }
      await saveSettings($, { language })
      return `Language: ${language}.`
    }
    case 'hover': {
      if (tail !== 'on' && tail !== 'off') {
        return 'hover on|off: pet a Pokémon by moving the pointer over it.'
      }
      await saveSettings($, { hover: tail === 'on' })
      return `Hover petting ${tail}.`
    }
    case 'export': {
      const path = tail || 'pokemon-team.json'
      await $.fs.write(path, `${JSON.stringify(team.map(({ uid: _uid, ...rest }) => rest), null, 2)}\n`)
      return `Exported ${team.length} Pokémon to ${path}.`
    }
    case 'import': {
      if (!tail) {
        return 'import <file>: a file /pokemon export wrote.'
      }
      const parsed: unknown = JSON.parse(await $.fs.read(tail))
      const imported: TeamMember[] = []
      for (const item of Array.isArray(parsed) ? parsed : []) {
        const key = typeof item?.key === 'string' ? item.key : undefined
        if (!key || !pokedexEntry(key) || team.length + imported.length >= MAX_TEAM) {
          continue
        }
        imported.push({
          uid: newUid(),
          key,
          nickname: typeof item.nickname === 'string' ? item.nickname : pickNickname([...team, ...imported]),
          shiny: item.shiny === true,
        })
      }
      await saveTeam($, [...team, ...imported])
      return `Imported ${imported.length} Pokémon.`
    }
    default:
      return HELP
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const [storedSettings, storedTeam, isSetUp] = await Promise.all([
      $.store.get('settings'),
      $.store.get('team'),
      $.store.get('isSetUp'),
    ])
    if (storedSettings && typeof storedSettings === 'object') {
      await update($, settingsAtom, () => ({ ...DEFAULT_SETTINGS, ...storedSettings }))
    }
    if (Array.isArray(storedTeam)) {
      const team = storedTeam.filter(
        (member): member is TeamMember =>
          typeof member?.uid === 'string' && typeof member?.key === 'string' && !!pokedexEntry(member.key),
      )
      await update($, teamAtom, () => team)
    }
    await $.command.register({
      name: 'pokemon',
      description: 'Pokémon in your Claude Code footer: spawn, remove, list, roll-call, size, place…',
      argumentHint: 'spawn pikachu | random | remove <name> | list | help',
    })
    if (!isSetUp) {
      // A first Pokémon so a fresh install shows something.
      await $.store.set('isSetUp', true)
      if ((await read($, teamAtom)).length === 0) {
        await spawn($, randomPokemon(Math.random).key, {})
      }
    }
    await syncWorld($)
    startTicker($)

    return next(e)
  })

  on('command.run', { command: 'pokemon' }, async ($, e) => {
    try {
      return { text: await runCommand($, e.args) }
    } catch (error) {
      return { text: `pokemon: ${String(error)}` }
    }
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      world.mood = 'working'
    }
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id && verdict.decision === 'ask') {
      world.mood = 'waiting'
    }
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (world.mood === 'waiting') {
      world.mood = 'working'
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      world.mood = 'idle'
      if (!e.isAborted) {
        celebrate(world)
      }
    }
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const g = geometry
    const data = e.data
    if (g && e.element === HOVER && typeof data === 'object' && data && 'x' in data && typeof data.x === 'number') {
      const mon = monAt(world, data.x * g.scale)
      if (mon) {
        swipe(mon)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const engine = await next(e)
    const settings = await read($, settingsAtom)
    if (settings.place !== 'footer') {
      return engine
    }
    return strip($, e, engine, settings.width)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const engine = await next(e)
    const settings = await read($, settingsAtom)
    if (settings.place !== 'band') {
      return engine
    }
    return strip($, e, engine, Math.max(12, (e.viewport?.columns ?? 80) - 2))
  })
}

// The Pokémon strip beside (footer) or below (band) what the engine draws there.
async function strip(
  $: EngineInterface,
  e: RenderInput<'SessionMode' | 'AbovePrompt'>,
  engine: RenderElement,
  columns: number,
): Promise<RenderElement> {
  const elements = $.ui.resolve(e)
  if (!('Raster' in elements)) {
    return engine
  }
  const [settings, team, isRasterForced] = await Promise.all([
    read($, settingsAtom),
    read($, teamAtom),
    read($, rasterForcedAtom),
  ])
  if (team.length === 0) {
    return engine
  }
  const { Box, Raster, Image, Client } = elements
  const isImage = !isRaster(settings, isRasterForced)
  const next: Geometry = {
    site: e.requestId,
    columns,
    rows: settings.rows,
    scale: isImage ? IMAGE_SCALE : 1,
    isImage,
  }
  const changed =
    !geometry ||
    geometry.columns !== next.columns ||
    geometry.rows !== next.rows ||
    geometry.scale !== next.scale ||
    geometry.site !== next.site
  geometry = next
  if (changed) {
    await syncWorld($)
  }
  const frame = compose(next)
  const sprite = isImage ? (
    <Image
      key={STRIP}
      source={{ rgba: frame.rgba.toBase64(), width: frame.width, height: frame.height }}
      columns={columns}
      rows={settings.rows}
      alt=" "
    />
  ) : (
    <Raster key={STRIP} cells={rasterCells(frame)} columns={columns} rows={settings.rows} />
  )
  const body = (
    <Box width={columns} height={settings.rows}>
      {sprite}
      {settings.hover && (
        <Box position="absolute" top={0} left={0}>
          <Client key={HOVER} module="./hover.tsx" width={columns} height={settings.rows} />
        </Box>
      )}
    </Box>
  )
  return e.component === 'SessionMode' ? (
    <Box flexDirection="row" alignItems="flex-end">
      {engine}
      <Box marginLeft={1}>{body}</Box>
    </Box>
  ) : (
    <Box flexDirection="column">
      {engine}
      {body}
    </Box>
  )
}
