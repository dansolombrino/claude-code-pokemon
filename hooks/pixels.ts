// RGBA bitmaps: crop, resample, composite, and pack as Raster half-block cells.

export type Bitmap = { width: number; height: number; rgba: Uint8Array }

const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

export function opaqueBounds(frames: readonly Bitmap[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (const frame of frames) {
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        if ((frame.rgba[(y * frame.width + x) * 4 + 3] ?? 0) > 0) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }
  }
  if (maxX < 0) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function crop(
  source: Bitmap,
  box: { x: number; y: number; width: number; height: number },
): Bitmap {
  const rgba = new Uint8Array(box.width * box.height * 4)
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * source.width + box.x) * 4
    rgba.set(source.rgba.subarray(from, from + box.width * 4), y * box.width * 4)
  }
  return { width: box.width, height: box.height, rgba }
}

// Shrinking averages each covered area so small sprites keep their colours;
// growing repeats pixels so pixel art stays sharp.
export function resample(source: Bitmap, width: number, height: number): Bitmap {
  const rgba = new Uint8Array(width * height * 4)
  const sx = source.width / width
  const sy = source.height / height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4
      if (sx <= 1 && sy <= 1) {
        const from = (Math.floor(y * sy) * source.width + Math.floor(x * sx)) * 4
        rgba.set(source.rgba.subarray(from, from + 4), to)
        continue
      }
      const x0 = Math.floor(x * sx)
      const y0 = Math.floor(y * sy)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
      let r = 0
      let g = 0
      let b = 0
      let opaque = 0
      let total = 0
      for (let yy = y0; yy < y1 && yy < source.height; yy++) {
        for (let xx = x0; xx < x1 && xx < source.width; xx++) {
          const from = (yy * source.width + xx) * 4
          total++
          if ((source.rgba[from + 3] ?? 0) > 127) {
            r += source.rgba[from] ?? 0
            g += source.rgba[from + 1] ?? 0
            b += source.rgba[from + 2] ?? 0
            opaque++
          }
        }
      }
      // Keep thin outlines: a pixel counts once a third of its area is opaque.
      if (opaque > 0 && opaque * 3 >= total) {
        rgba[to] = Math.round(r / opaque)
        rgba[to + 1] = Math.round(g / opaque)
        rgba[to + 2] = Math.round(b / opaque)
        rgba[to + 3] = 255
      }
    }
  }
  return { width, height, rgba }
}

export function mirror(source: Bitmap): Bitmap {
  const rgba = new Uint8Array(source.rgba.length)
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const from = (y * source.width + x) * 4
      const to = (y * source.width + (source.width - 1 - x)) * 4
      rgba.set(source.rgba.subarray(from, from + 4), to)
    }
  }
  return { width: source.width, height: source.height, rgba }
}

export function blank(width: number, height: number): Bitmap {
  return { width, height, rgba: new Uint8Array(width * height * 4) }
}

export function draw(target: Bitmap, source: Bitmap, left: number, top: number): void {
  const x0 = Math.round(left)
  const y0 = Math.round(top)
  for (let y = 0; y < source.height; y++) {
    const ty = y0 + y
    if (ty < 0 || ty >= target.height) {
      continue
    }
    for (let x = 0; x < source.width; x++) {
      const tx = x0 + x
      if (tx < 0 || tx >= target.width) {
        continue
      }
      const from = (y * source.width + x) * 4
      if ((source.rgba[from + 3] ?? 0) > 127) {
        target.rgba.set(source.rgba.subarray(from, from + 4), (ty * target.width + tx) * 4)
      }
    }
  }
}

function pixelColor(bitmap: Bitmap, x: number, y: number): number | null {
  if (y >= bitmap.height) {
    return null
  }
  const i = (y * bitmap.width + x) * 4
  if ((bitmap.rgba[i + 3] ?? 0) < 128) {
    return null
  }
  return ((bitmap.rgba[i] ?? 0) << 16) | ((bitmap.rgba[i + 1] ?? 0) << 8) | (bitmap.rgba[i + 2] ?? 0)
}

// One cell is two stacked pixels: an upper-half block, its foreground the top.
export function rasterCells(bitmap: Bitmap): string {
  const rows = Math.ceil(bitmap.height / 2)
  const words = new Uint32Array(bitmap.width * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < bitmap.width; x++) {
      const top = pixelColor(bitmap, x, row * 2)
      const bottom = pixelColor(bitmap, x, row * 2 + 1)
      const at = (row * bitmap.width + x) * 3
      if (top !== null) {
        words.set([UPPER_HALF, top, bottom ?? DEFAULT_COLOR], at)
      } else if (bottom !== null) {
        words.set([LOWER_HALF, bottom, DEFAULT_COLOR], at)
      } else {
        words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], at)
      }
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

function fromArt(art: readonly string[], palette: Readonly<Record<string, number>>): Bitmap {
  const height = art.length
  const width = Math.max(...art.map(line => line.length))
  const bitmap = blank(width, height)
  art.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const color = palette[line[x] ?? '.']
      if (color === undefined) {
        continue
      }
      bitmap.rgba.set([(color >> 16) & 255, (color >> 8) & 255, color & 255, 255], (y * width + x) * 4)
    }
  })
  return bitmap
}

export const HEART = fromArt(
  ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  { r: 0xff4d6d },
)

export const HAPPY = fromArt(
  ['.yyyyy.', 'yykykyy', 'yyyyyyy', 'ykyyyky', 'yykkkyy', '.yyyyy.'],
  { y: 0xffd23f, k: 0x3a2a00 },
)

export const ALERT = fromArt(['ww', 'ww', 'ww', 'ww', '..', 'ww'], { w: 0xffffff })

export const POKEBALL = fromArt(
  ['..kkkk..', '.krrrrk.', 'krrrrrrk', 'kkkwwkkk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
  { k: 0x202020, r: 0xe3350d, w: 0xf2f2f2 },
)
