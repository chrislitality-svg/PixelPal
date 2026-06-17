// ============================================================
// PixelPal -- GIF Recorder
// ============================================================
//
// Captures canvas frames and encodes them as an animated GIF.
// Uses a self-contained minimal GIF89a encoder with:
//   - Uniform 6x6x6 color cube quantization (216 colors)
//   - Standard LZW compression (variable code size, 12-bit max)
//   - Netscape 2.0 looping extension for animated playback
//
// No external dependencies required.
// ============================================================

// ----------------------------------------------------------------
// GIF Encoder helpers
// ----------------------------------------------------------------

/**
 * Build a 216-color global color table using a uniform 6x6x6
 * RGB cube, padded to 256 entries with zeros.
 */
function buildGlobalColorTable(): Uint8Array {
  const table = new Uint8Array(256 * 3);
  let idx = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        table[idx++] = Math.round(r * 51);
        table[idx++] = Math.round(g * 51);
        table[idx++] = Math.round(b * 51);
      }
    }
  }
  // Remaining 40 entries stay as 0,0,0
  return table;
}

/**
 * Map an RGBA pixel to the nearest index in the 6x6x6 color cube.
 * Fully transparent pixels (alpha < 128) are snapped to black (index 0).
 */
function quantizeIndex(r: number, g: number, b: number, a: number): number {
  if (a < 128) return 0; // transparent -> treat as black
  const ri = Math.min(5, Math.round(r / 51));
  const gi = Math.min(5, Math.round(g / 51));
  const bi = Math.min(5, Math.round(b / 51));
  return ri * 36 + gi * 6 + bi;
}

/**
 * Convert an array of ImageData frames into indexed-color frames
 * using the shared global color table.
 */
function quantizeFrames(frames: ImageData[]): Uint8Array[] {
  const result: Uint8Array[] = [];
  for (const frame of frames) {
    const px = frame.data;
    const pixelCount = px.length / 4;
    const indices = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      indices[i] = quantizeIndex(px[off], px[off + 1], px[off + 2], px[off + 3]);
    }
    result.push(indices);
  }
  return result;
}

// ----------------------------------------------------------------
// LZW Compression (GIF variant)
// ----------------------------------------------------------------

/**
 * Compress an array of color indices using the GIF LZW algorithm.
 *
 * @param indices  Pixel data as palette indices (0..255)
 * @param minCodeSize  Initial code size in bits (typically 8 for 256-color)
 * @returns Array of bytes forming the LZW-compressed data stream
 */
function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxCodeSize = 12;
  const maxCode = 1 << maxCodeSize; // 4096

  // Resettable code table: maps "prefix-suffix" string keys to codes
  let codeTable = new Map<string, number>();
  const resetTable = () => {
    codeTable.clear();
    for (let i = 0; i < clearCode; i++) {
      codeTable.set(String(i), i);
    }
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };

  const output: number[] = [];

  // Bit-packing state
  let bitBuf = 0;
  let bitsInBuf = 0;

  const writeCode = (code: number): void => {
    bitBuf |= code << bitsInBuf;
    bitsInBuf += codeSize;
    while (bitsInBuf >= 8) {
      output.push(bitBuf & 0xff);
      bitBuf >>>= 8;
      bitsInBuf -= 8;
    }
  };

  // -- Begin encoding --
  resetTable();
  writeCode(clearCode);

  if (indices.length === 0) {
    writeCode(eoiCode);
    if (bitsInBuf > 0) output.push(bitBuf & 0xff);
    return output;
  }

  let prefix = String(indices[0]);

  for (let i = 1; i < indices.length; i++) {
    const k = String(indices[i]);
    const combined = prefix + '-' + k;

    if (codeTable.has(combined)) {
      prefix = combined;
    } else {
      // Emit the code for the current prefix
      writeCode(codeTable.get(prefix)!);

      // Add the new combined string to the table (if room remains)
      if (nextCode < maxCode) {
        codeTable.set(combined, nextCode++);
        // Grow the code size when we cross a power-of-2 boundary
        if (nextCode > (1 << codeSize) && codeSize < maxCodeSize) {
          codeSize++;
        }
      } else {
        // Table full -- emit a clear code and rebuild
        writeCode(clearCode);
        resetTable();
      }

      prefix = k;
    }
  }

  // Emit the last prefix
  writeCode(codeTable.get(prefix)!);

  // Emit the End-of-Information code
  writeCode(eoiCode);

  // Flush any remaining bits in the buffer
  if (bitsInBuf > 0) {
    output.push(bitBuf & 0xff);
  }

  return output;
}

/**
 * Wrap LZW output bytes into GIF sub-blocks:
 * each sub-block is preceded by its length byte (max 255).
 */
function toSubBlocks(data: number[]): number[] {
  const blocks: number[] = [];
  let offset = 0;
  while (offset < data.length) {
    const size = Math.min(255, data.length - offset);
    blocks.push(size);
    for (let i = 0; i < size; i++) {
      blocks.push(data[offset + i]);
    }
    offset += size;
  }
  blocks.push(0); // block terminator
  return blocks;
}

// ----------------------------------------------------------------
// GIF89a binary structure builders
// ----------------------------------------------------------------

/** Write an ASCII string into a byte array at the given offset. */
function writeAscii(bytes: number[], str: string): void {
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
}

/** Write a little-endian 16-bit unsigned integer. */
function writeU16LE(bytes: number[], value: number): void {
  bytes.push(value & 0xff);
  bytes.push((value >> 8) & 0xff);
}

/**
 * Build the complete GIF89a binary as a byte array.
 */
function buildGif(
  indexedFrames: Uint8Array[],
  width: number,
  height: number,
  delayCentiseconds: number,
  colorTable: Uint8Array,
): number[] {
  const bytes: number[] = [];

  // ---- Header (6 bytes) ----
  writeAscii(bytes, 'GIF89a');

  // ---- Logical Screen Descriptor (7 bytes) ----
  writeU16LE(bytes, width);
  writeU16LE(bytes, height);
  // packed: GCT flag=1, color resolution=7 (8 bits), sort=0, GCT size=7 (256 entries)
  bytes.push(0xf7);
  bytes.push(0); // background color index
  bytes.push(0); // pixel aspect ratio

  // ---- Global Color Table (768 bytes = 256 * 3) ----
  for (let i = 0; i < 768; i++) {
    bytes.push(colorTable[i]);
  }

  // ---- Netscape 2.0 Application Extension (for infinite loop) ----
  bytes.push(0x21); // extension introducer
  bytes.push(0xff); // application extension label
  bytes.push(11);   // block size (always 11 for Netscape)
  writeAscii(bytes, 'NETSCAPE');
  writeAscii(bytes, '2.0');
  bytes.push(3);    // sub-block size
  bytes.push(1);    // sub-block ID
  writeU16LE(bytes, 0); // 0 = loop infinitely
  bytes.push(0);    // block terminator

  // ---- Frames ----
  for (const frameIndices of indexedFrames) {
    // -- Graphic Control Extension (8 bytes) --
    bytes.push(0x21); // extension introducer
    bytes.push(0xf9); // graphic control label
    bytes.push(4);    // block size (always 4)
    // packed: reserved=0, disposal=0 (no disposal), user input=0, transparent=0
    bytes.push(0x00);
    writeU16LE(bytes, delayCentiseconds); // delay in centiseconds
    bytes.push(0);    // transparent color index (unused)
    bytes.push(0);    // block terminator

    // -- Image Descriptor (10 bytes) --
    bytes.push(0x2c); // image separator
    writeU16LE(bytes, 0);  // left
    writeU16LE(bytes, 0);  // top
    writeU16LE(bytes, width);
    writeU16LE(bytes, height);
    bytes.push(0);    // packed: no local color table, not interlaced

    // -- LZW Image Data --
    const minCodeSize = 8; // 8 bits for 256-color palette
    bytes.push(minCodeSize); // LZW minimum code size

    const compressed = lzwEncode(frameIndices, minCodeSize);
    const subBlocks = toSubBlocks(compressed);
    for (let i = 0; i < subBlocks.length; i++) {
      bytes.push(subBlocks[i]);
    }
  }

  // ---- Trailer ----
  bytes.push(0x3b);

  return bytes;
}

// ----------------------------------------------------------------
// GifRecorder class
// ----------------------------------------------------------------

/**
 * GIF Recorder -- captures canvas frames and encodes as an
 * animated GIF using a built-in minimal GIF89a encoder.
 *
 * Usage:
 *   const recorder = new GifRecorder(canvas);
 *   const blob = await recorder.recordGif(3000); // 3-second clip
 *
 * For production use, gif.js is recommended for better quality
 * (median-cut quantization + Web Worker encoding), but this
 * implementation works entirely standalone with zero dependencies.
 */
export class GifRecorder {
  private _isRecording: boolean = false;
  private frames: ImageData[] = [];
  private captureTimer: ReturnType<typeof setInterval> | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Start recording canvas frames for the given duration.
   * Captures one frame every 100ms (~30 frames in 3 seconds).
   *
   * @param durationMs  Recording duration in milliseconds (default 3000)
   * @param captureIntervalMs  Interval between frame captures (default 100)
   * @returns A Promise that resolves with the animated GIF as a Blob
   */
  async recordGif(
    durationMs: number = 3000,
    captureIntervalMs: number = 100,
  ): Promise<Blob> {
    if (this._isRecording) {
      throw new Error('GifRecorder: already recording');
    }

    this._isRecording = true;
    this.frames = [];

    return new Promise<Blob>((resolve, reject) => {
      try {
        // Capture frames at the specified interval
        this.captureTimer = setInterval(() => {
          const ctx = this.canvas.getContext('2d');
          if (ctx) {
            const frame = ctx.getImageData(
              0, 0,
              this.canvas.width,
              this.canvas.height,
            );
            this.frames.push(frame);
          }
        }, captureIntervalMs);

        // Stop recording after the duration elapses
        setTimeout(() => {
          try {
            this.stopCapture();
            const gifBlob = this.encodeGif(captureIntervalMs);
            resolve(gifBlob);
          } catch (err) {
            reject(err);
          }
        }, durationMs);
      } catch (err) {
        this.stopCapture();
        reject(err);
      }
    });
  }

  /**
   * Take a single-frame screenshot of the current canvas.
   * Returns a PNG data URL.
   */
  takeScreenshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  /** Whether a recording is currently in progress. */
  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Stop the frame-capture interval.
   */
  private stopCapture(): void {
    if (this.captureTimer !== null) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    this._isRecording = false;
  }

  /**
   * Encode the captured frames into a GIF Blob.
   *
   * @param captureIntervalMs  The interval between captures,
   *   used to compute the per-frame delay in the GIF.
   */
  private encodeGif(captureIntervalMs: number): Blob {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Delay per frame in centiseconds (1 cs = 10ms)
    const delayCs = Math.max(1, Math.round(captureIntervalMs / 10));

    // Build the shared color table
    const colorTable = buildGlobalColorTable();

    // Quantize every frame to palette indices
    const indexedFrames = quantizeFrames(this.frames);

    // Assemble the full GIF binary
    const gifBytes = buildGif(indexedFrames, width, height, delayCs, colorTable);

    // Convert to a Blob
    const byteArray = new Uint8Array(gifBytes.length);
    for (let i = 0; i < gifBytes.length; i++) {
      byteArray[i] = gifBytes[i];
    }

    return new Blob([byteArray], { type: 'image/gif' });
  }
}
