# Ghostty Terminal API Documentation

Complete API reference for `@cmux/ghostty-terminal` - a terminal emulator using Ghostty's VT100 parser via WebAssembly.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Terminal Class](#terminal-class)
  - [Constructor](#constructor)
  - [Methods](#methods)
  - [Events](#events)
  - [Properties](#properties)
- [Options](#options)
  - [ITerminalOptions](#iterminaloptions)
  - [ITheme](#itheme)
- [Addons](#addons)
  - [FitAddon](#fitaddon)
  - [Creating Custom Addons](#creating-custom-addons)
- [Low-Level APIs](#low-level-apis)
- [Examples](#examples)
- [Migration from xterm.js](#migration-from-xtermjs)
- [Troubleshooting](#troubleshooting)

---

## Installation

### From Source

```bash
git clone https://github.com/coder/ghostty-wasm.git
cd ghostty-wasm/task8
bun install
bun run build
```

### Import in Your Project

```typescript
import { Terminal } from './lib/index.ts';
import { FitAddon } from './lib/addons/fit.ts';
```

---

## Quick Start

```typescript
import { Terminal } from './lib/index.ts';
import { FitAddon } from './lib/addons/fit.ts';

// Create terminal instance
const term = new Terminal({
  cols: 80,
  rows: 24,
  cursorBlink: true,
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
  },
});

// Add FitAddon for responsive sizing
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

// Open in DOM container
const container = document.getElementById('terminal');
await term.open(container);

// Fit to container size
fitAddon.fit();

// Write output
term.write('Hello, World!\r\n');
term.write('\x1b[1;32mGreen text\x1b[0m\r\n');

// Handle user input
term.onData((data) => {
  console.log('User typed:', data);
  // Echo back
  term.write(data);
});
```

---

## Terminal Class

The main terminal emulator class that integrates all components.

### Constructor

```typescript
new Terminal(options?: ITerminalOptions)
```

Creates a new terminal instance with optional configuration.

**Parameters:**

- `options` (optional): Configuration options (see [ITerminalOptions](#iterminaloptions))

**Example:**

```typescript
const term = new Terminal({
  cols: 80,
  rows: 24,
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Monaco, monospace',
});
```

### Methods

#### `open(parent: HTMLElement): Promise<void>`

Opens the terminal in a parent DOM element. This initializes all components (buffer, parser, renderer, input handler) and starts rendering.

**Parameters:**

- `parent`: The DOM element to render the terminal into

**Returns:** Promise that resolves when terminal is ready

**Example:**

```typescript
const container = document.getElementById('terminal');
await term.open(container);
```

**Note:** Must be called before any other terminal operations.

---

#### `write(data: string): void`

Writes data to the terminal. Supports plain text and ANSI escape sequences.

**Parameters:**

- `data`: String to write (may contain ANSI escape codes)

**Example:**

```typescript
term.write('Hello, World!\r\n');
term.write('\x1b[1;31mRed bold text\x1b[0m\r\n');
term.write('Line 1\r\nLine 2\r\n');
```

**ANSI Sequences Supported:**

- Colors: `\x1b[30-37m` (fg), `\x1b[40-47m` (bg), `\x1b[90-97m` (bright fg)
- Styles: `\x1b[1m` (bold), `\x1b[3m` (italic), `\x1b[4m` (underline)
- Cursor: `\x1b[H` (home), `\x1b[<row>;<col>H` (position)
- Erase: `\x1b[2J` (clear screen), `\x1b[K` (clear line)
- 256-color: `\x1b[38;5;<n>m` (fg), `\x1b[48;5;<n>m` (bg)
- RGB: `\x1b[38;2;<r>;<g>;<b>m` (fg), `\x1b[48;2;<r>;<g>;<b>m` (bg)

---

#### `writeln(data: string): void`

Writes data followed by a newline (`\r\n`).

**Parameters:**

- `data`: String to write

**Example:**

```typescript
term.writeln('Line 1');
term.writeln('Line 2');
// Equivalent to:
// term.write('Line 1\r\n');
// term.write('Line 2\r\n');
```

---

#### `clear(): void`

Clears the terminal screen (erases all content).

**Example:**

```typescript
term.clear();
```

---

#### `reset(): void`

Resets the terminal to initial state. Clears screen, resets cursor, and clears styles.

**Example:**

```typescript
term.reset();
```

---

#### `resize(cols: number, rows: number): void`

Resizes the terminal dimensions.

**Parameters:**

- `cols`: New column count
- `rows`: New row count

**Example:**

```typescript
term.resize(100, 30);
```

**Note:** Triggers `onResize` event.

---

#### `focus(): void`

Gives keyboard focus to the terminal.

**Example:**

```typescript
term.focus();
```

---

#### `blur(): void`

Removes keyboard focus from the terminal.

**Example:**

```typescript
term.blur();
```

---

#### `loadAddon(addon: ITerminalAddon): void`

Loads an addon into the terminal.

**Parameters:**

- `addon`: Addon instance implementing `ITerminalAddon`

**Example:**

```typescript
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
```

---

#### `dispose(): void`

Disposes the terminal and cleans up resources. Removes from DOM and stops rendering.

**Example:**

```typescript
term.dispose();
```

**Note:** Terminal cannot be reused after disposal.

---

### Events

#### `onData: IEvent<string>`

Fired when user types in the terminal. Use this to send input to your backend (PTY, WebSocket, etc.).

**Callback Parameter:**

- `data`: String containing user input (may include escape sequences for special keys)

**Special Keys:**

- Enter: `\r`
- Backspace: `\x7F` or `\x08`
- Tab: `\t`
- Escape: `\x1b`
- Arrow Up: `\x1b[A`
- Arrow Down: `\x1b[B`
- Arrow Right: `\x1b[C`
- Arrow Left: `\x1b[D`

**Example:**

```typescript
term.onData((data) => {
  if (data === '\r') {
    console.log('User pressed Enter');
  } else if (data === '\x7F') {
    console.log('User pressed Backspace');
  } else {
    console.log('User typed:', data);
  }

  // Echo back
  term.write(data);
});
```

**WebSocket Example:**

```typescript
const ws = new WebSocket('ws://localhost:3000');

// Send user input to backend
term.onData((data) => {
  ws.send(JSON.stringify({ type: 'input', data }));
});

// Display backend output
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  term.write(msg.data);
};
```

---

#### `onResize: IEvent<{ cols: number; rows: number }>`

Fired when terminal is resized.

**Callback Parameter:**

- Object with `cols` and `rows` properties

**Example:**

```typescript
term.onResize(({ cols, rows }) => {
  console.log(`Terminal resized to ${cols}x${rows}`);
  // Notify backend of new size
  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
});
```

---

#### `onBell: IEvent<void>`

Fired when terminal receives a bell character (`\x07`).

**Example:**

```typescript
term.onBell(() => {
  console.log('Bell!');
  // Play sound, show notification, etc.
  new Audio('bell.mp3').play();
});
```

---

### Properties

#### `cols: number`

Current number of columns (read-only).

**Example:**

```typescript
console.log(`Terminal has ${term.cols} columns`);
```

---

#### `rows: number`

Current number of rows (read-only).

**Example:**

```typescript
console.log(`Terminal has ${term.rows} rows`);
```

---

#### `element?: HTMLElement`

The DOM element containing the terminal (set after `open()`).

**Example:**

```typescript
if (term.element) {
  term.element.style.border = '1px solid #ccc';
}
```

---

#### `textarea?: HTMLTextAreaElement`

The hidden textarea used for input (set after `open()`).

---

## Options

### ITerminalOptions

Configuration options for Terminal constructor.

```typescript
interface ITerminalOptions {
  cols?: number; // Default: 80
  rows?: number; // Default: 24
  cursorBlink?: boolean; // Default: false
  cursorStyle?: 'block' | 'underline' | 'bar'; // Default: 'block'
  theme?: ITheme; // Custom theme
  scrollback?: number; // Default: 1000 lines
  fontSize?: number; // Default: 15
  fontFamily?: string; // Default: 'monospace'
  allowTransparency?: boolean; // Default: false
  wasmPath?: string; // Path to ghostty-vt.wasm
}
```

**Details:**

- **`cols`**: Number of columns (characters per line)
- **`rows`**: Number of rows (lines visible on screen)
- **`cursorBlink`**: Whether cursor should blink
- **`cursorStyle`**: Cursor appearance
  - `'block'`: Filled rectangle (default)
  - `'underline'`: Line under character
  - `'bar'`: Vertical line before character
- **`theme`**: Color scheme (see [ITheme](#itheme))
- **`scrollback`**: Number of lines to keep in scroll buffer
- **`fontSize`**: Font size in pixels
- **`fontFamily`**: CSS font-family string
- **`allowTransparency`**: Enable transparent background
- **`wasmPath`**: Path to `ghostty-vt.wasm` file (relative to HTML file)

**Example:**

```typescript
const term = new Terminal({
  cols: 120,
  rows: 40,
  cursorBlink: true,
  cursorStyle: 'bar',
  fontSize: 16,
  fontFamily: "'Fira Code', 'Monaco', monospace",
  scrollback: 5000,
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
  },
});
```

---

### ITheme

Color scheme configuration.

```typescript
interface ITheme {
  foreground?: string; // Default text color
  background?: string; // Background color
  cursor?: string; // Cursor color
  cursorAccent?: string; // Cursor text color
  selectionBackground?: string; // Selection highlight color
  selectionForeground?: string; // Selection text color

  // ANSI colors (0-15)
  black?: string; // Color 0
  red?: string; // Color 1
  green?: string; // Color 2
  yellow?: string; // Color 3
  blue?: string; // Color 4
  magenta?: string; // Color 5
  cyan?: string; // Color 6
  white?: string; // Color 7
  brightBlack?: string; // Color 8
  brightRed?: string; // Color 9
  brightGreen?: string; // Color 10
  brightYellow?: string; // Color 11
  brightBlue?: string; // Color 12
  brightMagenta?: string; // Color 13
  brightCyan?: string; // Color 14
  brightWhite?: string; // Color 15
}
```

**All colors are CSS color strings** (hex, rgb, rgba, color names).

**Example Themes:**

```typescript
// Dark theme (VS Code)
const vscodeTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

// Dracula theme
const draculaTheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
};

// Use theme
const term = new Terminal({ theme: draculaTheme });
```

---

## Addons

### FitAddon

Automatically resizes terminal to fit its container element.

#### Import

```typescript
import { FitAddon } from './lib/addons/fit.ts';
```

#### Usage

```typescript
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);

// Manual fit
fitAddon.fit();

// Auto-fit on container resize
fitAddon.observeResize();

// Stop observing
fitAddon.dispose();
```

#### Methods

##### `fit(): void`

Calculates optimal dimensions and resizes terminal to fit container.

```typescript
fitAddon.fit();
```

##### `observeResize(): void`

Automatically calls `fit()` when container is resized (uses ResizeObserver).

```typescript
fitAddon.observeResize();
```

##### `dispose(): void`

Stops observing and cleans up resources.

```typescript
fitAddon.dispose();
```

#### Example: Responsive Terminal

```typescript
const container = document.getElementById('terminal');
const term = new Terminal();
const fitAddon = new FitAddon();

term.loadAddon(fitAddon);
await term.open(container);

// Initial fit
fitAddon.fit();

// Auto-fit on window resize
fitAddon.observeResize();
```

---

### Creating Custom Addons

Implement the `ITerminalAddon` interface:

```typescript
interface ITerminalAddon {
  activate(terminal: ITerminalCore): void;
  dispose(): void;
}
```

**Example: Simple Logger Addon**

```typescript
class LoggerAddon implements ITerminalAddon {
  private terminal?: ITerminalCore;
  private dataListener?: IDisposable;

  activate(terminal: ITerminalCore): void {
    this.terminal = terminal;

    // Subscribe to data events
    this.dataListener = terminal.onData((data) => {
      console.log('Terminal data:', data);
    });
  }

  dispose(): void {
    this.dataListener?.dispose();
  }
}

// Usage
const logger = new LoggerAddon();
term.loadAddon(logger);
```

---

## Low-Level APIs

For advanced usage, you can access low-level components directly.

### ScreenBuffer

Manages terminal screen state (2D grid of cells).

```typescript
import { ScreenBuffer } from './lib/buffer.ts';

const buffer = new ScreenBuffer(80, 24, 1000);
buffer.writeString('Hello');
buffer.moveCursorTo(10, 5);
const line = buffer.getLine(0);
```

See buffer implementation for full API.

---

### VTParser

Parses VT100/ANSI escape sequences.

```typescript
import { VTParser } from './lib/vt-parser.ts';

const parser = new VTParser(buffer);
parser.parse('Hello\x1b[1;31mRed\x1b[0m');
```

---

### CanvasRenderer

Renders terminal buffer to canvas.

```typescript
import { CanvasRenderer } from './lib/renderer.ts';

const renderer = new CanvasRenderer(canvas, buffer, {
  fontSize: 14,
  fontFamily: 'monospace',
});
renderer.render();
```

---

### Ghostty WASM

Direct access to Ghostty's WASM parsers.

```typescript
import { Ghostty, SgrParser, KeyEncoder } from './lib/ghostty.ts';

const ghostty = await Ghostty.load('./ghostty-vt.wasm');

// Parse SGR (colors)
const sgrParser = ghostty.createSgrParser();
for (const attr of sgrParser.parse([1, 31])) {
  console.log('Bold red:', attr);
}

// Encode keys
const keyEncoder = ghostty.createKeyEncoder();
const bytes = keyEncoder.encode({
  action: KeyAction.PRESS,
  key: Key.A,
  mods: Mods.CTRL,
});
```

---

## Examples

### Example 1: Basic Echo Terminal

```typescript
import { Terminal } from './lib/index.ts';

const term = new Terminal({ cols: 80, rows: 24 });
await term.open(document.getElementById('terminal'));

term.write('Type something:\r\n$ ');

term.onData((data) => {
  if (data === '\r') {
    term.write('\r\n$ ');
  } else if (data === '\x7F') {
    term.write('\b \b'); // Backspace
  } else {
    term.write(data); // Echo
  }
});
```

---

### Example 2: WebSocket Integration (File Browser)

```typescript
const term = new Terminal();
await term.open(document.getElementById('terminal'));

const ws = new WebSocket('ws://localhost:3001/ws');
let currentLine = '';

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'output') {
    term.write(msg.stdout.replace(/\n/g, '\r\n'));
    if (msg.stderr) {
      term.write(`\x1b[31m${msg.stderr}\x1b[0m`);
    }
    term.write('\r\n$ ');
  }
};

term.onData((data) => {
  if (data === '\r') {
    ws.send(JSON.stringify({ type: 'command', data: currentLine }));
    term.write('\r\n');
    currentLine = '';
  } else if (data === '\x7F') {
    if (currentLine.length > 0) {
      currentLine = currentLine.slice(0, -1);
      term.write('\b \b');
    }
  } else {
    currentLine += data;
    term.write(data);
  }
});
```

---

### Example 3: Custom Theme

```typescript
const term = new Terminal({
  theme: {
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
});
```

---

### Example 4: Progress Bar

```typescript
function showProgress(percent: number) {
  const width = 40;
  const filled = Math.floor((width * percent) / 100);
  const empty = width - filled;

  const bar = '\x1b[32m' + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + '\x1b[0m';

  term.write(`\r[${bar}] ${percent}%`);
}

// Animate
let progress = 0;
const interval = setInterval(() => {
  showProgress(progress);
  progress += 5;
  if (progress > 100) {
    clearInterval(interval);
    term.write('\r\n\x1b[32mComplete!\x1b[0m\r\n');
  }
}, 100);
```

---

## Migration from xterm.js

This library provides an xterm.js-compatible API for easy migration.

### API Compatibility

| Feature                   | xterm.js | ghostty-terminal | Notes                               |
| ------------------------- | -------- | ---------------- | ----------------------------------- |
| `new Terminal(options)`   | ✅       | ✅               | Same API                            |
| `term.open(parent)`       | ✅       | ✅               | Returns Promise in ghostty-terminal |
| `term.write(data)`        | ✅       | ✅               | Same                                |
| `term.writeln(data)`      | ✅       | ✅               | Same                                |
| `term.onData`             | ✅       | ✅               | Same                                |
| `term.onResize`           | ✅       | ✅               | Same                                |
| `term.resize(cols, rows)` | ✅       | ✅               | Same                                |
| `term.clear()`            | ✅       | ✅               | Same                                |
| `term.reset()`            | ✅       | ✅               | Same                                |
| `term.dispose()`          | ✅       | ✅               | Same                                |
| `FitAddon`                | ✅       | ✅               | Same API                            |
| Selection API             | ✅       | ❌               | Not yet implemented                 |
| `term.scrollToBottom()`   | ✅       | ❌               | Not yet implemented                 |
| `term.scrollLines(n)`     | ✅       | ❌               | Not yet implemented                 |
| Weblinks addon            | ✅       | ❌               | Not yet implemented                 |
| Search addon              | ✅       | ❌               | Not yet implemented                 |

### Migration Example

**Before (xterm.js):**

```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

const term = new Terminal();
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();
```

**After (ghostty-terminal):**

```typescript
import { Terminal } from './lib/index.ts';
import { FitAddon } from './lib/addons/fit.ts';

const term = new Terminal();
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
await term.open(document.getElementById('terminal')); // Note: async
fitAddon.fit();
```

**Key Differences:**

1. `term.open()` is async (returns Promise) - add `await`
2. Import paths are different
3. Some addons not yet available

---

## Troubleshooting

### Terminal doesn't appear

**Problem:** Terminal container is empty

**Solutions:**

1. Make sure you `await term.open(container)`
2. Check container has non-zero dimensions
3. Check console for errors

```typescript
const container = document.getElementById('terminal');
console.log('Container size:', container.offsetWidth, container.offsetHeight);
await term.open(container);
```

---

### WASM loading error

**Problem:** `Failed to fetch ghostty-vt.wasm`

**Solutions:**

1. Verify `ghostty-vt.wasm` exists in correct location
2. Serve via HTTP server (not file://)
3. Set correct `wasmPath` in options

```typescript
const term = new Terminal({
  wasmPath: '/path/to/ghostty-vt.wasm',
});
```

---

### Colors not displaying

**Problem:** ANSI colors show as plain text

**Solutions:**

1. Verify escape sequences are correct: `\x1b[31m` not `\\x1b[31m`
2. Check theme colors are set
3. Use `\r\n` for newlines, not just `\n`

```typescript
// ❌ Wrong
term.write('\\x1b[31mRed\\x1b[0m\n');

// ✅ Correct
term.write('\x1b[31mRed\x1b[0m\r\n');
```

---

### Input not working

**Problem:** Keyboard input doesn't trigger `onData`

**Solutions:**

1. Make sure terminal is focused: `term.focus()`
2. Check `onData` listener is attached
3. Click on terminal to give it focus

```typescript
term.onData((data) => {
  console.log('Got data:', data);
});
term.focus();
```

---

### Poor performance

**Problem:** Rendering is slow or laggy

**Solutions:**

1. Reduce terminal size (cols × rows)
2. Limit output rate (buffer large writes)
3. Reduce scrollback buffer size

```typescript
// Limit output rate
function writeAsync(data: string) {
  const chunks = data.match(/.{1,1000}/g) || [];
  let i = 0;

  function writeNext() {
    if (i < chunks.length) {
      term.write(chunks[i++]);
      setTimeout(writeNext, 10);
    }
  }

  writeNext();
}
```

---

### FitAddon not working

**Problem:** Terminal doesn't resize to fit container

**Solutions:**

1. Make sure container has explicit dimensions (CSS)
2. Call `fitAddon.fit()` after opening terminal
3. Use `fitAddon.observeResize()` for automatic resizing

```css
#terminal {
  width: 100%;
  height: 500px; /* Must have explicit height */
}
```

```typescript
await term.open(container);
fitAddon.fit(); // Call after open()
```

---

## Additional Resources

- [GitHub Repository](https://github.com/coder/ghostty-wasm)
- [Ghostty Project](https://github.com/ghostty-org/ghostty)
- [ANSI Escape Codes Reference](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [VT100 User Guide](https://vt100.net/docs/vt100-ug/)

---

## License

See project LICENSE (AGPL-3.0)
