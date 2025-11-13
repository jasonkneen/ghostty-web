/**
 * TypeScript wrapper for libghostty-vt WASM API
 *
 * This provides a high-level, ergonomic API around the low-level C ABI
 * exports from libghostty-vt.wasm
 */

import {
  CellFlags,
  type Cursor,
  type GhosttyCell,
  type GhosttyWasmExports,
  KeyEncoderOption,
  type KeyEvent,
  type KittyKeyFlags,
  type RGB,
  type RGBColor,
  type SgrAttribute,
  SgrAttributeTag,
  type TerminalHandle,
} from './types';

// Re-export types for convenience
export {
  SgrAttributeTag,
  type SgrAttribute,
  type RGBColor,
  type GhosttyCell,
  type Cursor,
  type RGB,
  CellFlags,
};

/**
 * Main Ghostty WASM wrapper class
 */
export class Ghostty {
  private exports: GhosttyWasmExports;
  private memory: WebAssembly.Memory;

  constructor(wasmInstance: WebAssembly.Instance) {
    this.exports = wasmInstance.exports as GhosttyWasmExports;
    this.memory = this.exports.memory;
  }

  /**
   * Get current memory buffer (may change when memory grows)
   */
  private getBuffer(): ArrayBuffer {
    return this.memory.buffer;
  }

  /**
   * Create an SGR parser instance
   */
  createSgrParser(): SgrParser {
    return new SgrParser(this.exports);
  }

  /**
   * Create a key encoder instance
   */
  createKeyEncoder(): KeyEncoder {
    return new KeyEncoder(this.exports);
  }

  /**
   * Create a terminal emulator instance
   */
  createTerminal(cols: number = 80, rows: number = 24): GhosttyTerminal {
    return new GhosttyTerminal(this.exports, this.memory, cols, rows);
  }

  /**
   * Load Ghostty WASM from URL or file path
   */
  static async load(wasmPath: string): Promise<Ghostty> {
    let wasmBytes: ArrayBuffer;

    // Try loading as file first (for Node/Bun environments)
    try {
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(wasmPath);
      wasmBytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (e) {
      // Fall back to fetch (for browser environments)
      const response = await fetch(wasmPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
      }
      wasmBytes = await response.arrayBuffer();
      if (wasmBytes.byteLength === 0) {
        throw new Error(`WASM file is empty (0 bytes). Check path: ${wasmPath}`);
      }
    }

    const wasmModule = await WebAssembly.instantiate(wasmBytes, {
      env: {
        log: (ptr: number, len: number) => {
          const instance = (wasmModule as any).instance;
          const bytes = new Uint8Array(instance.exports.memory.buffer, ptr, len);
          const text = new TextDecoder().decode(bytes);
          console.log('[ghostty-wasm]', text);
        },
      },
    });

    return new Ghostty(wasmModule.instance);
  }
}

/**
 * SGR (Select Graphic Rendition) Parser
 * Parses ANSI color/style sequences like "1;31" (bold red)
 */
export class SgrParser {
  private exports: GhosttyWasmExports;
  private parser: number = 0;

  constructor(exports: GhosttyWasmExports) {
    this.exports = exports;

    // Allocate parser
    const parserPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const result = this.exports.ghostty_sgr_new(0, parserPtrPtr);
    if (result !== 0) {
      throw new Error(`Failed to create SGR parser: ${result}`);
    }

    // Read the parser pointer
    const view = new DataView(this.exports.memory.buffer);
    this.parser = view.getUint32(parserPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(parserPtrPtr);
  }

  /**
   * Parse SGR parameters (e.g., [1, 31] for bold red)
   * @returns Iterator of SGR attributes
   */
  *parse(params: number[]): Generator<SgrAttribute> {
    if (params.length === 0) return;

    // Allocate parameter array
    const paramsPtr = this.exports.ghostty_wasm_alloc_u16_array(params.length);
    const view = new DataView(this.exports.memory.buffer);

    // Write parameters (uint16_t array)
    for (let i = 0; i < params.length; i++) {
      view.setUint16(paramsPtr + i * 2, params[i], true);
    }

    // Set params in parser (null for subs, we don't use subparams yet)
    const result = this.exports.ghostty_sgr_set_params(
      this.parser,
      paramsPtr,
      0, // subsPtr - null
      params.length
    );

    this.exports.ghostty_wasm_free_u16_array(paramsPtr, params.length);

    if (result !== 0) {
      throw new Error(`Failed to set SGR params: ${result}`);
    }

    // Iterate through attributes
    const attrPtr = this.exports.ghostty_wasm_alloc_sgr_attribute();

    try {
      while (this.exports.ghostty_sgr_next(this.parser, attrPtr)) {
        const attr = this.readAttribute(attrPtr);
        if (attr) yield attr;
      }
    } finally {
      this.exports.ghostty_wasm_free_sgr_attribute(attrPtr);
    }
  }

  private readAttribute(attrPtr: number): SgrAttribute | null {
    const tag = this.exports.ghostty_sgr_attribute_tag(attrPtr);
    const view = new DataView(this.exports.memory.buffer);

    switch (tag) {
      case SgrAttributeTag.BOLD:
        return { tag: SgrAttributeTag.BOLD };
      case SgrAttributeTag.RESET_BOLD:
        return { tag: SgrAttributeTag.RESET_BOLD };
      case SgrAttributeTag.ITALIC:
        return { tag: SgrAttributeTag.ITALIC };
      case SgrAttributeTag.RESET_ITALIC:
        return { tag: SgrAttributeTag.RESET_ITALIC };
      case SgrAttributeTag.FAINT:
        return { tag: SgrAttributeTag.FAINT };
      case SgrAttributeTag.RESET_FAINT:
        return { tag: SgrAttributeTag.RESET_FAINT };
      case SgrAttributeTag.UNDERLINE:
        return { tag: SgrAttributeTag.UNDERLINE };
      case SgrAttributeTag.RESET_UNDERLINE:
        return { tag: SgrAttributeTag.RESET_UNDERLINE };
      case SgrAttributeTag.BLINK:
        return { tag: SgrAttributeTag.BLINK };
      case SgrAttributeTag.RESET_BLINK:
        return { tag: SgrAttributeTag.RESET_BLINK };
      case SgrAttributeTag.INVERSE:
        return { tag: SgrAttributeTag.INVERSE };
      case SgrAttributeTag.RESET_INVERSE:
        return { tag: SgrAttributeTag.RESET_INVERSE };
      case SgrAttributeTag.INVISIBLE:
        return { tag: SgrAttributeTag.INVISIBLE };
      case SgrAttributeTag.RESET_INVISIBLE:
        return { tag: SgrAttributeTag.RESET_INVISIBLE };
      case SgrAttributeTag.STRIKETHROUGH:
        return { tag: SgrAttributeTag.STRIKETHROUGH };
      case SgrAttributeTag.RESET_STRIKETHROUGH:
        return { tag: SgrAttributeTag.RESET_STRIKETHROUGH };

      case SgrAttributeTag.FG_8:
      case SgrAttributeTag.FG_16:
      case SgrAttributeTag.FG_256: {
        // Color value is stored after the tag (uint8_t)
        const color = view.getUint8(attrPtr + 4);
        return { tag, color };
      }

      case SgrAttributeTag.FG_RGB:
      case SgrAttributeTag.BG_RGB:
      case SgrAttributeTag.UNDERLINE_COLOR_RGB: {
        // RGB color stored after the tag (3 bytes: r, g, b)
        const r = view.getUint8(attrPtr + 4);
        const g = view.getUint8(attrPtr + 5);
        const b = view.getUint8(attrPtr + 6);
        return { tag, color: { r, g, b } };
      }

      case SgrAttributeTag.FG_DEFAULT:
        return { tag: SgrAttributeTag.FG_DEFAULT };

      case SgrAttributeTag.BG_8:
      case SgrAttributeTag.BG_16:
      case SgrAttributeTag.BG_256: {
        const color = view.getUint8(attrPtr + 4);
        return { tag, color };
      }

      case SgrAttributeTag.BG_DEFAULT:
        return { tag: SgrAttributeTag.BG_DEFAULT };

      case SgrAttributeTag.UNDERLINE_COLOR_DEFAULT:
        return { tag: SgrAttributeTag.UNDERLINE_COLOR_DEFAULT };

      default:
        // Unknown or unhandled
        return null;
    }
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.exports.ghostty_sgr_reset(this.parser);
  }

  /**
   * Free parser resources
   */
  dispose(): void {
    if (this.parser) {
      this.exports.ghostty_sgr_free(this.parser);
      this.parser = 0;
    }
  }
}

/**
 * Key Encoder
 * Converts keyboard events into terminal escape sequences
 */
export class KeyEncoder {
  private exports: GhosttyWasmExports;
  private encoder: number = 0;

  constructor(exports: GhosttyWasmExports) {
    this.exports = exports;

    // Allocate encoder
    const encoderPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const result = this.exports.ghostty_key_encoder_new(0, encoderPtrPtr);
    if (result !== 0) {
      throw new Error(`Failed to create key encoder: ${result}`);
    }

    // Read the encoder pointer
    const view = new DataView(this.exports.memory.buffer);
    this.encoder = view.getUint32(encoderPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(encoderPtrPtr);
  }

  /**
   * Set an encoder option
   */
  setOption(option: KeyEncoderOption, value: boolean | number): void {
    const valuePtr = this.exports.ghostty_wasm_alloc_u8();
    const view = new DataView(this.exports.memory.buffer);

    if (typeof value === 'boolean') {
      view.setUint8(valuePtr, value ? 1 : 0);
    } else {
      view.setUint8(valuePtr, value);
    }

    const result = this.exports.ghostty_key_encoder_setopt(this.encoder, option, valuePtr);

    this.exports.ghostty_wasm_free_u8(valuePtr);

    // Check result if it's defined (some WASM functions may return void)
    if (result !== undefined && result !== 0) {
      throw new Error(`Failed to set encoder option: ${result}`);
    }
  }

  /**
   * Enable Kitty keyboard protocol with specified flags
   */
  setKittyFlags(flags: KittyKeyFlags): void {
    this.setOption(KeyEncoderOption.KITTY_KEYBOARD_FLAGS, flags);
  }

  /**
   * Encode a key event to escape sequence
   */
  encode(event: KeyEvent): Uint8Array {
    // Create key event structure
    const eventPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const createResult = this.exports.ghostty_key_event_new(0, eventPtrPtr);
    if (createResult !== 0) {
      throw new Error(`Failed to create key event: ${createResult}`);
    }

    const view = new DataView(this.exports.memory.buffer);
    const eventPtr = view.getUint32(eventPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(eventPtrPtr);

    // Set event properties
    this.exports.ghostty_key_event_set_action(eventPtr, event.action);
    this.exports.ghostty_key_event_set_key(eventPtr, event.key);
    this.exports.ghostty_key_event_set_mods(eventPtr, event.mods);

    if (event.utf8) {
      const encoder = new TextEncoder();
      const utf8Bytes = encoder.encode(event.utf8);
      const utf8Ptr = this.exports.ghostty_wasm_alloc_u8_array(utf8Bytes.length);
      new Uint8Array(this.exports.memory.buffer).set(utf8Bytes, utf8Ptr);
      this.exports.ghostty_key_event_set_utf8(eventPtr, utf8Ptr, utf8Bytes.length);
      this.exports.ghostty_wasm_free_u8_array(utf8Ptr, utf8Bytes.length);
    }

    // Allocate output buffer
    const bufferSize = 32;
    const bufPtr = this.exports.ghostty_wasm_alloc_u8_array(bufferSize);
    const writtenPtr = this.exports.ghostty_wasm_alloc_usize();

    // Encode
    const encodeResult = this.exports.ghostty_key_encoder_encode(
      this.encoder,
      eventPtr,
      bufPtr,
      bufferSize,
      writtenPtr
    );

    if (encodeResult !== 0) {
      this.exports.ghostty_wasm_free_u8_array(bufPtr, bufferSize);
      this.exports.ghostty_wasm_free_usize(writtenPtr);
      this.exports.ghostty_key_event_free(eventPtr);
      throw new Error(`Failed to encode key: ${encodeResult}`);
    }

    // Read result
    const bytesWritten = view.getUint32(writtenPtr, true);
    const encoded = new Uint8Array(this.exports.memory.buffer, bufPtr, bytesWritten).slice(); // Copy the data

    // Cleanup
    this.exports.ghostty_wasm_free_u8_array(bufPtr, bufferSize);
    this.exports.ghostty_wasm_free_usize(writtenPtr);
    this.exports.ghostty_key_event_free(eventPtr);

    return encoded;
  }

  /**
   * Free encoder resources
   */
  dispose(): void {
    if (this.encoder) {
      this.exports.ghostty_key_encoder_free(this.encoder);
      this.encoder = 0;
    }
  }
}

/**
 * GhosttyTerminal - Wraps the WASM terminal emulator
 *
 * Provides a TypeScript-friendly interface to Ghostty's complete
 * terminal implementation via WASM.
 *
 * @example
 * ```typescript
 * const ghostty = await Ghostty.load('./ghostty-vt.wasm');
 * const term = ghostty.createTerminal(80, 24);
 *
 * term.write('Hello\x1b[31m Red\x1b[0m\n');
 * const cursor = term.getCursor();
 * const cells = term.getLine(0);
 *
 * term.free();
 * ```
 */
export class GhosttyTerminal {
  private exports: GhosttyWasmExports;
  private memory: WebAssembly.Memory;
  private handle: TerminalHandle;
  private _cols: number;
  private _rows: number;

  /**
   * Size of ghostty_cell_t in bytes (12 bytes in WASM)
   * Structure: codepoint(u32) + fg_rgb(3xu8) + bg_rgb(3xu8) + flags(u8) + width(u8)
   */
  private static readonly CELL_SIZE = 12;

  /**
   * Create a new terminal.
   *
   * @param exports WASM exports
   * @param memory WASM memory
   * @param cols Number of columns (default: 80)
   * @param rows Number of rows (default: 24)
   * @throws Error if allocation fails
   */
  constructor(
    exports: GhosttyWasmExports,
    memory: WebAssembly.Memory,
    cols: number = 80,
    rows: number = 24
  ) {
    this.exports = exports;
    this.memory = memory;
    this._cols = cols;
    this._rows = rows;

    const handle = this.exports.ghostty_terminal_new(cols, rows);
    if (handle === 0) {
      throw new Error('Failed to allocate terminal (out of memory)');
    }

    this.handle = handle;
  }

  /**
   * Free the terminal. Must be called to prevent memory leaks.
   */
  free(): void {
    if (this.handle !== 0) {
      this.exports.ghostty_terminal_free(this.handle);
      this.handle = 0;
    }
  }

  /**
   * Write data to terminal (parses VT sequences and updates screen).
   *
   * @param data UTF-8 string or Uint8Array
   *
   * @example
   * ```typescript
   * term.write('Hello, World!\n');
   * term.write('\x1b[1;31mBold Red\x1b[0m\n');
   * term.write(new Uint8Array([0x1b, 0x5b, 0x41])); // Up arrow
   * ```
   */
  write(data: string | Uint8Array): void {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    if (bytes.length === 0) return;

    // Allocate in WASM memory
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(bytes.length);
    const mem = new Uint8Array(this.memory.buffer);
    mem.set(bytes, ptr);

    try {
      this.exports.ghostty_terminal_write(this.handle, ptr, bytes.length);
    } finally {
      this.exports.ghostty_wasm_free_u8_array(ptr, bytes.length);
    }
  }

  /**
   * Resize the terminal.
   *
   * @param cols New column count
   * @param rows New row count
   */
  resize(cols: number, rows: number): void {
    this.exports.ghostty_terminal_resize(this.handle, cols, rows);
    this._cols = cols;
    this._rows = rows;
  }

  /**
   * Get terminal dimensions.
   */
  get cols(): number {
    return this._cols;
  }

  get rows(): number {
    return this._rows;
  }

  /**
   * Get terminal dimensions (for IRenderable compatibility)
   */
  getDimensions(): { cols: number; rows: number } {
    return { cols: this._cols, rows: this._rows };
  }

  /**
   * Get cursor position and visibility.
   */
  getCursor(): Cursor {
    return {
      x: this.exports.ghostty_terminal_get_cursor_x(this.handle),
      y: this.exports.ghostty_terminal_get_cursor_y(this.handle),
      visible: this.exports.ghostty_terminal_get_cursor_visible(this.handle),
    };
  }

  /**
   * Get scrollback length (number of lines in history).
   */
  getScrollbackLength(): number {
    return this.exports.ghostty_terminal_get_scrollback_length(this.handle);
  }

  /**
   * Get a line of cells from the visible screen.
   *
   * @param y Line number (0 = top visible line)
   * @returns Array of cells, or null if y is out of bounds
   *
   * @example
   * ```typescript
   * const cells = term.getLine(0);
   * if (cells) {
   *   for (const cell of cells) {
   *     const char = String.fromCodePoint(cell.codepoint);
   *     const isBold = (cell.flags & CellFlags.BOLD) !== 0;
   *     console.log(`"${char}" ${isBold ? 'bold' : 'normal'}`);
   *   }
   * }
   * ```
   */
  getLine(y: number): GhosttyCell[] | null {
    if (y < 0 || y >= this._rows) return null;

    const bufferSize = this._cols * GhosttyTerminal.CELL_SIZE;

    // Allocate buffer
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(bufferSize);

    try {
      // Get line from WASM
      const count = this.exports.ghostty_terminal_get_line(this.handle, y, ptr, this._cols);

      if (count < 0) return null;

      // Parse cells
      const cells: GhosttyCell[] = [];
      const view = new DataView(this.memory.buffer, ptr, bufferSize);

      for (let i = 0; i < count; i++) {
        const offset = i * GhosttyTerminal.CELL_SIZE;
        cells.push({
          codepoint: view.getUint32(offset, true),
          fg_r: view.getUint8(offset + 4),
          fg_g: view.getUint8(offset + 5),
          fg_b: view.getUint8(offset + 6),
          bg_r: view.getUint8(offset + 7),
          bg_g: view.getUint8(offset + 8),
          bg_b: view.getUint8(offset + 9),
          flags: view.getUint8(offset + 10),
          width: view.getUint8(offset + 11),
        });
      }

      return cells;
    } finally {
      this.exports.ghostty_wasm_free_u8_array(ptr, bufferSize);
    }
  }

  /**
   * Get a line from scrollback history.
   *
   * @param offset Line offset from top of scrollback (0 = oldest line)
   * @returns Array of cells, or null if not available
   */
  getScrollbackLine(offset: number): GhosttyCell[] | null {
    const scrollbackLen = this.getScrollbackLength();
    if (offset < 0 || offset >= scrollbackLen) return null;

    const bufferSize = this._cols * GhosttyTerminal.CELL_SIZE;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(bufferSize);

    try {
      const count = this.exports.ghostty_terminal_get_scrollback_line(
        this.handle,
        offset,
        ptr,
        this._cols
      );

      if (count < 0) return null;

      // Parse cells (same logic as getLine)
      const cells: GhosttyCell[] = [];
      const view = new DataView(this.memory.buffer, ptr, bufferSize);

      for (let i = 0; i < count; i++) {
        const offset = i * GhosttyTerminal.CELL_SIZE;
        cells.push({
          codepoint: view.getUint32(offset, true),
          fg_r: view.getUint8(offset + 4),
          fg_g: view.getUint8(offset + 5),
          fg_b: view.getUint8(offset + 6),
          bg_r: view.getUint8(offset + 7),
          bg_g: view.getUint8(offset + 8),
          bg_b: view.getUint8(offset + 9),
          flags: view.getUint8(offset + 10),
          width: view.getUint8(offset + 11),
        });
      }

      return cells;
    } finally {
      this.exports.ghostty_wasm_free_u8_array(ptr, bufferSize);
    }
  }

  /**
   * Check if any part of the screen is dirty.
   */
  isDirty(): boolean {
    return this.exports.ghostty_terminal_is_dirty(this.handle);
  }

  /**
   * Check if a specific row is dirty.
   */
  isRowDirty(y: number): boolean {
    if (y < 0 || y >= this._rows) return false;
    return this.exports.ghostty_terminal_is_row_dirty(this.handle, y);
  }

  /**
   * Clear all dirty flags (call after rendering).
   */
  clearDirty(): void {
    this.exports.ghostty_terminal_clear_dirty(this.handle);
  }

  /**
   * Get all visible lines at once (convenience method).
   *
   * @returns Array of line arrays, or empty array on error
   */
  getAllLines(): GhosttyCell[][] {
    const lines: GhosttyCell[][] = [];
    for (let y = 0; y < this._rows; y++) {
      const line = this.getLine(y);
      if (line) {
        lines.push(line);
      }
    }
    return lines;
  }

  /**
   * Get only the dirty lines (for optimized rendering).
   *
   * @returns Map of row number to cell array
   */
  getDirtyLines(): Map<number, GhosttyCell[]> {
    const dirtyLines = new Map<number, GhosttyCell[]>();
    for (let y = 0; y < this._rows; y++) {
      if (this.isRowDirty(y)) {
        const line = this.getLine(y);
        if (line) {
          dirtyLines.set(y, line);
        }
      }
    }
    return dirtyLines;
  }
}
