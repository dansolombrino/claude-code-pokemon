import { expect, test } from 'claude-code/testing'

import { newMon, step, swipe } from '../hooks/world'
import type { World } from '../hooks/world'

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function worldWith(count: number, random: () => number): World {
  const world: World = { width: 40, spriteHeight: 12, mood: 'idle', mons: [] }
  for (let i = 0; i < count; i++) {
    world.mons.push(newMon({ uid: `m${i}`, key: 'pikachu', nickname: `M${i}`, shiny: false }, world, random))
  }
  return world
}

test('Pokémon wander but never leave the floor', async () => {
  const random = seeded(7)
  const world = worldWith(4, random)
  let walked = false
  for (let i = 0; i < 2000; i++) {
    world.mood = i % 500 < 250 ? 'idle' : 'working'
    step(world, random)
    for (const mon of world.mons) {
      expect(mon.x >= 0 && mon.x <= world.width - mon.width).toBe(true)
      walked ||= mon.motion === 'walkLeft' || mon.motion === 'walkRight'
    }
  }
  expect(walked).toBe(true)
})

test('everyone stops with an alert while Claude waits, and moves on after', async () => {
  const random = seeded(3)
  const world = worldWith(3, random)
  for (let i = 0; i < 200; i++) {
    step(world, random)
  }
  world.mood = 'waiting'
  step(world, random)
  const parked = world.mons.map(mon => mon.x)
  for (let i = 0; i < 50; i++) {
    step(world, random)
  }
  expect(world.mons.map(mon => mon.x)).toEqual(parked)
  expect(world.mons.every(mon => mon.bubble?.kind === 'alert')).toBe(true)
  world.mood = 'idle'
  step(world, random)
  expect(world.mons.some(mon => mon.bubble?.kind === 'alert')).toBe(false)
})

test('a petted Pokémon is happy, then goes back to what it was doing', async () => {
  const random = seeded(11)
  const world = worldWith(1, random)
  const mon = world.mons[0]!
  mon.spawnTicks = 0
  mon.motion = 'walkRight'
  swipe(mon)
  expect(mon.motion).toBe('swipe')
  expect(mon.bubble?.kind).toBe('happy')
  for (let i = 0; i < 16; i++) {
    step(world, () => 0.5)
  }
  expect(mon.motion).toBe('walkRight')
})
