// The Pokémon behaviour of jakobhoeg/vscode-pokemon (src/panel/states.ts,
// base-pokemon-type.ts), stepped once per 100 ms tick on a one-row floor.

export const TICK_MS = 100

export type Motion = 'sitIdle' | 'walkLeft' | 'walkRight' | 'swipe'
export type BubbleKind = 'happy' | 'heart' | 'alert'
export type Mood = 'idle' | 'working' | 'waiting'

export type Mon = {
  uid: string
  key: string
  nickname: string
  shiny: boolean
  x: number
  width: number
  baseSpeed: number
  motion: Motion
  counter: number
  heldMotion?: Motion
  facingLeft: boolean
  bubble?: { kind: BubbleKind; ticks: number }
  friend?: string
  spawnTicks: number
  animMs: number
}

export type World = {
  width: number
  spriteHeight: number
  mood: Mood
  mons: Mon[]
}

const NEXT: Record<Motion, readonly Motion[]> = {
  sitIdle: ['walkLeft', 'walkRight'],
  walkLeft: ['sitIdle', 'walkRight'],
  walkRight: ['sitIdle', 'walkLeft'],
  swipe: ['sitIdle'],
}
const SIT_HOLD_TICKS = 50
const BUSY_SIT_HOLD_TICKS = 15
const SWIPE_TICKS = 15
const STOP_CHANCE = 0.01
const BUBBLE_TICKS = 30
const FRIEND_BUBBLE_TICKS = 20
const SPAWN_TICKS = 6
// vscode-pokemon's normal speed, 3 px a tick for a 128 px (medium) sprite.
const NORMAL_SPEED = 3
const UPSTREAM_SPRITE_PX = 128
const WORKING_SPEEDUP = 1.6

export type Random = () => number

export function newMon(
  spec: { uid: string; key: string; nickname: string; shiny: boolean },
  world: World,
  random: Random,
): Mon {
  return {
    ...spec,
    x: random() * Math.max(1, world.width * 0.7),
    width: Math.max(1, Math.round(world.spriteHeight * 0.6)),
    baseSpeed: NORMAL_SPEED * (0.7 + random() * 0.6),
    motion: 'sitIdle',
    counter: 0,
    facingLeft: false,
    spawnTicks: SPAWN_TICKS,
    animMs: 0,
  }
}

function speed(world: World, mon: Mon): number {
  const scaled = (mon.baseSpeed * world.spriteHeight) / UPSTREAM_SPRITE_PX
  return world.mood === 'working' ? scaled * WORKING_SPEEDUP : scaled
}

function enter(mon: Mon, motion: Motion): void {
  mon.motion = motion
  mon.counter = 0
  mon.animMs = 0
  if (motion === 'walkLeft') {
    mon.facingLeft = true
  } else if (motion === 'walkRight' || motion === 'sitIdle') {
    mon.facingLeft = false
  }
}

function isDone(world: World, mon: Mon, random: Random): boolean {
  mon.counter++
  switch (mon.motion) {
    case 'sitIdle':
      return mon.counter > (world.mood === 'working' ? BUSY_SIT_HOLD_TICKS : SIT_HOLD_TICKS)
    case 'swipe':
      return mon.counter > SWIPE_TICKS
    case 'walkLeft':
      mon.x -= speed(world, mon)
      return random() < STOP_CHANCE || mon.x <= 0
    case 'walkRight':
      mon.x += speed(world, mon)
      return random() < STOP_CHANCE || mon.x >= world.width - mon.width
  }
}

// One mon befriends another walking through it, as PokemonCollection.seekNewFriends.
function seekNewFriends(world: World): void {
  for (const mon of world.mons) {
    if (mon.friend || mon.spawnTicks > 0) {
      continue
    }
    for (const other of world.mons) {
      if (other === mon || other.friend || other.spawnTicks > 0) {
        continue
      }
      const isWalking = other.motion === 'walkLeft' || other.motion === 'walkRight'
      if (isWalking && other.x > mon.x && other.x < mon.x + mon.width) {
        mon.friend = other.uid
        mon.bubble = { kind: 'heart', ticks: FRIEND_BUBBLE_TICKS }
        other.bubble = { kind: 'heart', ticks: FRIEND_BUBBLE_TICKS }
        break
      }
    }
  }
}

export function step(world: World, random: Random): void {
  seekNewFriends(world)
  for (const mon of world.mons) {
    mon.animMs += TICK_MS
    if (mon.bubble && mon.bubble.kind !== 'alert' && --mon.bubble.ticks <= 0) {
      mon.bubble = undefined
    }
    if (mon.spawnTicks > 0) {
      mon.spawnTicks--
      continue
    }
    if (world.mood === 'waiting') {
      // Everyone stops and looks up while Claude waits on the person.
      if (mon.motion !== 'sitIdle') {
        enter(mon, 'sitIdle')
      }
      mon.bubble = { kind: 'alert', ticks: 1 }
      continue
    }
    if (mon.bubble?.kind === 'alert') {
      mon.bubble = undefined
    }
    if (!isDone(world, mon, random)) {
      continue
    }
    if (mon.motion === 'swipe' && mon.heldMotion) {
      const held = mon.heldMotion
      mon.heldMotion = undefined
      enter(mon, held)
      continue
    }
    const options = NEXT[mon.motion]
    enter(mon, options[Math.floor(random() * options.length)] ?? 'sitIdle')
  }
  for (const mon of world.mons) {
    mon.x = Math.max(0, Math.min(mon.x, world.width - mon.width))
  }
}

// Hovering a Pokémon pets it: it stops for a moment and is happy.
export function swipe(mon: Mon): void {
  if (mon.motion === 'swipe' || mon.spawnTicks > 0) {
    return
  }
  mon.heldMotion = mon.motion
  enter(mon, 'swipe')
  mon.bubble = { kind: 'happy', ticks: BUBBLE_TICKS }
}

export function celebrate(world: World): void {
  for (const mon of world.mons) {
    if (mon.spawnTicks === 0) {
      mon.bubble = { kind: 'happy', ticks: BUBBLE_TICKS }
    }
  }
}

export function monAt(world: World, x: number): Mon | undefined {
  for (let i = world.mons.length - 1; i >= 0; i--) {
    const mon = world.mons[i]
    if (mon && x >= mon.x && x < mon.x + mon.width) {
      return mon
    }
  }
  return undefined
}
