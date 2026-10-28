import type { EngineInterface } from 'claude-code'

import { decodeGif } from './gif'
import type { Gif } from './gif'
import { crop, mirror, opaqueBounds, resample } from './pixels'
import type { Bitmap } from './pixels'
import type { PokedexEntry } from './pokedex-lookup'

// Sprites are fetched from vscode-pokemon at a pinned commit, never bundled:
// they are © The Pokémon Company, and this repository ships code only.
export const SPRITES_COMMIT = 'bc761cd4582d5d22072c42bd00f9f18900d464aa'
const SPRITES_URL = `https://raw.githubusercontent.com/jakobhoeg/vscode-pokemon/${SPRITES_COMMIT}/media`

export type Animation = { frames: Bitmap[]; delays: number[]; total: number }
export type SpriteSet = {
  width: number
  idle: Animation
  walk: Animation
  idleLeft: Animation
  walkLeft: Animation
}

const gifs = new Map<string, Promise<Gif | undefined>>()
const sets = new Map<string, Promise<SpriteSet>>()

async function cacheRoot($: EngineInterface): Promise<string> {
  const home =
    (await $.env.get('XDG_CACHE_HOME')) ??
    (await $.env.get('LOCALAPPDATA')) ??
    `${(await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '.'}/.cache`
  return `${home.replaceAll('\\', '/')}/claude-code-pokemon/${SPRITES_COMMIT.slice(0, 12)}`
}

function loadGif($: EngineInterface, entry: PokedexEntry, file: string): Promise<Gif | undefined> {
  const id = `${entry.key}/${file}`
  let pending = gifs.get(id)
  if (!pending) {
    pending = (async () => {
      const path = `${await cacheRoot($)}/gen${entry.generation}/${entry.key}/${file}`
      if (!(await $.fs.exists(path))) {
        const url = `${SPRITES_URL}/gen${entry.generation}/${entry.key}/${file}`
        const result = await $.process.run(['curl', '-fsSL', '--create-dirs', '-o', path, url], {
          timeoutMs: 30_000,
        })
        if (result.exitCode !== 0) {
          return undefined
        }
      }
      const { base64 } = await $.fs.read(path, { as: 'bytes' })
      return decodeGif(Uint8Array.fromBase64(base64))
    })().catch(() => undefined)
    // A failed download is tried again on the next spawn rather than cached.
    void pending.then(gif => {
      if (!gif) {
        gifs.delete(id)
      }
    })
    gifs.set(id, pending)
  }
  return pending
}

function toAnimation(gif: Gif, box: ReturnType<typeof opaqueBounds>, height: number): Animation {
  const width = Math.max(1, Math.round((box.width * height) / box.height))
  const frames = gif.frames.map(frame =>
    resample(crop({ width: gif.width, height: gif.height, rgba: frame.rgba }, box), width, height),
  )
  const delays = gif.frames.map(frame => frame.delayMs)
  return { frames, delays, total: delays.reduce((sum, delay) => sum + delay, 0) }
}

function mirrored(animation: Animation): Animation {
  return { ...animation, frames: animation.frames.map(mirror) }
}

export function frameAt(animation: Animation, elapsedMs: number): Bitmap {
  let t = animation.total > 0 ? elapsedMs % animation.total : 0
  for (let i = 0; i < animation.frames.length; i++) {
    t -= animation.delays[i] ?? 0
    if (t < 0) {
      return animation.frames[i] ?? animation.frames[0]!
    }
  }
  return animation.frames[0]!
}

// Sprites face right; vscode-pokemon mirrors them to walk left unless the
// Pokémon has its own left-facing walk.
export function loadSpriteSet(
  $: EngineInterface,
  entry: PokedexEntry,
  shiny: boolean,
  height: number,
): Promise<SpriteSet> {
  const color = shiny && entry.hasShiny ? 'shiny' : 'default'
  const id = `${entry.key}/${color}/${height}`
  let pending = sets.get(id)
  if (!pending) {
    pending = (async () => {
      const [idle, walk, walkLeft] = await Promise.all([
        loadGif($, entry, `${color}_idle_8fps.gif`),
        loadGif($, entry, `${color}_walk_8fps.gif`),
        entry.hasLeftWalk ? loadGif($, entry, `${color}_walk_left_8fps.gif`) : undefined,
      ])
      if (!idle || !walk) {
        throw new Error(`Could not fetch the sprites of ${entry.name}`)
      }
      // One box over every frame keeps the feet on the floor between animations.
      const all = [idle, walk, ...(walkLeft ? [walkLeft] : [])].flatMap(gif =>
        gif.frames.map(frame => ({ width: gif.width, height: gif.height, rgba: frame.rgba })),
      )
      const box = opaqueBounds(all)
      const idleAnim = toAnimation(idle, box, height)
      const walkAnim = toAnimation(walk, box, height)
      return {
        width: idleAnim.frames[0]?.width ?? 1,
        idle: idleAnim,
        walk: walkAnim,
        idleLeft: mirrored(idleAnim),
        walkLeft: walkLeft ? toAnimation(walkLeft, box, height) : mirrored(walkAnim),
      }
    })()
    void pending.catch(() => sets.delete(id))
    sets.set(id, pending)
  }
  return pending
}
