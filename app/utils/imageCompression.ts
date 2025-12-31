export type CompressedImage = {
  blob: Blob
  width: number
  height: number
  contentType: string
}

type CompressOptions = {
  maxSide?: number
  quality?: number
}

function clampQuality(q: number): number {
  if (!Number.isFinite(q)) return 0.8
  return Math.min(1, Math.max(0.1, q))
}

type LoadedBitmap = {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  drawTo: (ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) => void
}

async function loadBitmap(file: File): Promise<LoadedBitmap> {
  // Prefer ImageBitmap (fast, avoids base64), fallback to HTMLImageElement.
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file)
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => {
        ctx.drawImage(bmp, 0, 0, w, h)
        // Release memory ASAP
        try { bmp.close() } catch { /* noop */ }
      },
      drawTo: (ctx, dx, dy, dw, dh) => {
        ctx.drawImage(bmp, dx, dy, dw, dh)
        // Release memory ASAP
        try { bmp.close() } catch { /* noop */ }
      }
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Ne mogu da učitam sliku.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Ne mogu da učitam sliku.'))
    el.src = dataUrl
  })

  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    draw: (ctx, w, h) => {
      ctx.drawImage(img, 0, 0, w, h)
    },
    drawTo: (ctx, dx, dy, dw, dh) => {
      ctx.drawImage(img, dx, dy, dw, dh)
    }
  }
}

export async function compressImageToJpeg(file: File, opts: CompressOptions = {}): Promise<CompressedImage> {
  const maxSide = Number.isFinite(opts.maxSide) ? Number(opts.maxSide) : 1280
  const quality = clampQuality(Number(opts.quality ?? 0.8))

  const src = await loadBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
  const width = Math.max(1, Math.round(src.width * scale))
  const height = Math.max(1, Math.round(src.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Browser ne podržava obradu slike (canvas).')
  }

  // High-quality resize hints (browser-dependent).
  try {
    ;(ctx as any).imageSmoothingEnabled = true
    ;(ctx as any).imageSmoothingQuality = 'high'
  } catch {
    // ignore
  }

  src.draw(ctx, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Ne mogu da kompresujem sliku.'))),
      'image/jpeg',
      quality
    )
  })

  return {
    blob,
    width,
    height,
    contentType: 'image/jpeg'
  }
}

type SquareCompressOptions = {
  size?: number
  quality?: number
}

export async function compressImageToSquareJpeg(file: File, opts: SquareCompressOptions = {}): Promise<CompressedImage> {
  const size = Number.isFinite(opts.size) ? Math.max(1, Math.round(Number(opts.size))) : 500
  const quality = clampQuality(Number(opts.quality ?? 0.85))

  const src = await loadBitmap(file)

  // Scale to cover the square, then center-crop by drawing with negative offset.
  const scale = Math.max(size / src.width, size / src.height)
  const dw = Math.round(src.width * scale)
  const dh = Math.round(src.height * scale)
  const dx = Math.round((size - dw) / 2)
  const dy = Math.round((size - dh) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Browser ne podržava obradu slike (canvas).')
  }

  try {
    ;(ctx as any).imageSmoothingEnabled = true
    ;(ctx as any).imageSmoothingQuality = 'high'
  } catch {
    // ignore
  }

  src.drawTo(ctx, dx, dy, dw, dh)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Ne mogu da kompresujem sliku.'))),
      'image/jpeg',
      quality
    )
  })

  return {
    blob,
    width: size,
    height: size,
    contentType: 'image/jpeg'
  }
}


