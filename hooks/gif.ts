// A GIF89a decoder: the hooks runtime has no DOM or Node to decode images.

export type GifFrame = { rgba: Uint8Array; delayMs: number }
export type Gif = { width: number; height: number; frames: GifFrame[] }

const DEFAULT_DELAY_MS = 125

function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount)
  const clear = 1 << minCodeSize
  const end = clear + 1
  const prefix = new Int32Array(4096)
  const suffix = new Uint8Array(4096)
  const stack = new Uint8Array(4097)
  let codeSize = minCodeSize + 1
  let next = end + 1
  let previous = -1
  let first = 0
  let bits = 0
  let buffer = 0
  let written = 0
  for (let i = 0; i < clear; i++) {
    prefix[i] = -1
    suffix[i] = i
  }
  for (let byte = 0; byte < data.length && written < pixelCount; byte++) {
    buffer |= (data[byte] ?? 0) << bits
    bits += 8
    while (bits >= codeSize && written < pixelCount) {
      const code = buffer & ((1 << codeSize) - 1)
      buffer >>>= codeSize
      bits -= codeSize
      if (code === clear) {
        codeSize = minCodeSize + 1
        next = end + 1
        previous = -1
        continue
      }
      if (code === end) {
        return out
      }
      let top = 0
      let walk = code
      if (previous === -1) {
        out[written++] = suffix[code] ?? 0
        first = code
        previous = code
        continue
      }
      if (code >= next) {
        stack[top++] = first
        walk = previous
      }
      while (walk >= clear) {
        stack[top++] = suffix[walk] ?? 0
        walk = prefix[walk] ?? 0
      }
      first = suffix[walk] ?? 0
      stack[top++] = first
      while (top > 0 && written < pixelCount) {
        out[written++] = stack[--top] ?? 0
      }
      if (next < 4096) {
        prefix[next] = previous
        suffix[next] = first
        next++
        if (next === 1 << codeSize && codeSize < 12) {
          codeSize++
        }
      }
      previous = code
    }
  }
  return out
}

function deinterlace(indices: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(indices.length)
  let row = 0
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ] as const) {
    for (let y = start; y < height; y += step) {
      out.set(indices.subarray(row * width, (row + 1) * width), y * width)
      row++
    }
  }
  return out
}

export function decodeGif(bytes: Uint8Array): Gif {
  const header = String.fromCharCode(...bytes.subarray(0, 6))
  if (header !== 'GIF89a' && header !== 'GIF87a') {
    throw new Error('Not a GIF')
  }
  const u16 = (at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
  const width = u16(6)
  const height = u16(8)
  const flags = bytes[10] ?? 0
  let at = 13
  let globalPalette: Uint8Array | undefined
  if (flags & 0x80) {
    const size = 3 * (1 << ((flags & 7) + 1))
    globalPalette = bytes.subarray(at, at + size)
    at += size
  }
  const canvas = new Uint8Array(width * height * 4)
  const frames: GifFrame[] = []
  let delayMs = DEFAULT_DELAY_MS
  let transparent = -1
  let disposal = 0

  const readSubBlocks = (): Uint8Array => {
    const parts: Uint8Array[] = []
    let total = 0
    while (at < bytes.length) {
      const size = bytes[at++] ?? 0
      if (size === 0) {
        break
      }
      parts.push(bytes.subarray(at, at + size))
      total += size
      at += size
    }
    const joined = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      joined.set(part, offset)
      offset += part.length
    }
    return joined
  }

  while (at < bytes.length) {
    const block = bytes[at++]
    if (block === 0x3b) {
      break
    }
    if (block === 0x21) {
      const label = bytes[at++]
      if (label === 0xf9) {
        const packed = bytes[at + 1] ?? 0
        disposal = (packed >> 2) & 7
        const delay = u16(at + 2) * 10
        delayMs = delay > 0 ? delay : DEFAULT_DELAY_MS
        transparent = packed & 1 ? (bytes[at + 4] ?? -1) : -1
      }
      readSubBlocks()
      continue
    }
    if (block !== 0x2c) {
      break
    }
    const left = u16(at)
    const top = u16(at + 2)
    const frameWidth = u16(at + 4)
    const frameHeight = u16(at + 6)
    const frameFlags = bytes[at + 8] ?? 0
    at += 9
    let palette = globalPalette
    if (frameFlags & 0x80) {
      const size = 3 * (1 << ((frameFlags & 7) + 1))
      palette = bytes.subarray(at, at + size)
      at += size
    }
    const minCodeSize = bytes[at++] ?? 2
    let indices = lzwDecode(readSubBlocks(), minCodeSize, frameWidth * frameHeight)
    if (frameFlags & 0x40) {
      indices = deinterlace(indices, frameWidth, frameHeight)
    }
    const restore = disposal === 3 ? canvas.slice() : undefined
    for (let y = 0; y < frameHeight; y++) {
      const cy = top + y
      if (cy >= height) {
        break
      }
      for (let x = 0; x < frameWidth; x++) {
        const cx = left + x
        if (cx >= width) {
          break
        }
        const index = indices[y * frameWidth + x] ?? 0
        if (index === transparent || !palette) {
          continue
        }
        const to = (cy * width + cx) * 4
        canvas[to] = palette[index * 3] ?? 0
        canvas[to + 1] = palette[index * 3 + 1] ?? 0
        canvas[to + 2] = palette[index * 3 + 2] ?? 0
        canvas[to + 3] = 255
      }
    }
    frames.push({ rgba: canvas.slice(), delayMs })
    if (disposal === 2) {
      for (let y = top; y < Math.min(height, top + frameHeight); y++) {
        canvas.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + frameWidth)) * 4)
      }
    } else if (restore) {
      canvas.set(restore)
    }
    delayMs = DEFAULT_DELAY_MS
    transparent = -1
    disposal = 0
  }
  return { width, height, frames }
}
