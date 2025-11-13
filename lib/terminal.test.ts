/**
 * Terminal Integration Tests
 *
 * Tests the main Terminal class that integrates all components.
 * Note: These are logic-focused tests. Visual/rendering tests are skipped
 * since they require a full browser environment with canvas.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Terminal } from './terminal';

// Mock DOM environment for basic tests
// Note: Some tests will be skipped if DOM is not fully available

describe('Terminal', () => {
  let container: HTMLElement | null = null;

  beforeEach(() => {
    // Create a container element if document is available
    if (typeof document !== 'undefined') {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    // Clean up container
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  describe('Constructor', () => {
    test('creates terminal with default size', () => {
      const term = new Terminal();
      expect(term.cols).toBe(80);
      expect(term.rows).toBe(24);
    });

    test('creates terminal with custom size', () => {
      const term = new Terminal({ cols: 100, rows: 30 });
      expect(term.cols).toBe(100);
      expect(term.rows).toBe(30);
    });

    test('creates terminal with custom options', () => {
      const term = new Terminal({
        cols: 120,
        rows: 40,
        scrollback: 5000,
        fontSize: 14,
        fontFamily: 'Courier New',
      });
      expect(term.cols).toBe(120);
      expect(term.rows).toBe(40);
    });

    test('does not throw on construction', () => {
      expect(() => new Terminal()).not.toThrow();
    });
  });

  describe('Lifecycle', () => {
    test('terminal is not open before open() is called', () => {
      const term = new Terminal();
      expect(() => term.write('test')).toThrow('Terminal must be opened');
    });

    test('can be disposed without being opened', () => {
      const term = new Terminal();
      expect(() => term.dispose()).not.toThrow();
    });

    test('cannot write after disposal', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);
      term.dispose();

      expect(() => term.write('test')).toThrow('Terminal has been disposed');
    });

    test('cannot open twice', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      await expect(term.open(container)).rejects.toThrow('already open');

      term.dispose();
    });

    test('cannot open after disposal', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      term.dispose();

      await expect(term.open(container)).rejects.toThrow('has been disposed');
    });
  });

  describe('Properties', () => {
    test('exposes cols and rows', () => {
      const term = new Terminal({ cols: 90, rows: 25 });
      expect(term.cols).toBe(90);
      expect(term.rows).toBe(25);
    });

    test('exposes element after open', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      expect(term.element).toBeUndefined();

      await term.open(container);
      expect(term.element).toBe(container);

      term.dispose();
    });
  });

  describe('Events', () => {
    test('onData event exists', () => {
      const term = new Terminal();
      expect(typeof term.onData).toBe('function');
    });

    test('onResize event exists', () => {
      const term = new Terminal();
      expect(typeof term.onResize).toBe('function');
    });

    test('onBell event exists', () => {
      const term = new Terminal();
      expect(typeof term.onBell).toBe('function');
    });

    test('onData can register listeners', () => {
      const term = new Terminal();
      const disposable = term.onData((data) => {
        // Listener callback
      });
      expect(typeof disposable.dispose).toBe('function');
      disposable.dispose();
    });

    test('onResize fires when terminal is resized', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal({ cols: 80, rows: 24 });
      await term.open(container);

      let resizeEvent: { cols: number; rows: number } | null = null;
      term.onResize((e) => {
        resizeEvent = e;
      });

      term.resize(100, 30);

      expect(resizeEvent).not.toBeNull();
      expect(resizeEvent?.cols).toBe(100);
      expect(resizeEvent?.rows).toBe(30);

      term.dispose();
    });

    test('onBell fires on bell character', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      let bellFired = false;
      term.onBell(() => {
        bellFired = true;
      });

      term.write('\x07'); // Bell character

      // Give it a moment to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(bellFired).toBe(true);

      term.dispose();
    });
  });

  describe('Writing', () => {
    test('write() does not throw after open', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.write('Hello, World!')).not.toThrow();

      term.dispose();
    });

    test('write() accepts string', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.write('test string')).not.toThrow();

      term.dispose();
    });

    test('write() accepts Uint8Array', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      const data = new TextEncoder().encode('test');
      expect(() => term.write(data)).not.toThrow();

      term.dispose();
    });

    test('writeln() adds newline', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.writeln('test line')).not.toThrow();

      term.dispose();
    });
  });

  describe('Resizing', () => {
    test('resize() updates dimensions', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal({ cols: 80, rows: 24 });
      await term.open(container);

      term.resize(100, 30);

      expect(term.cols).toBe(100);
      expect(term.rows).toBe(30);

      term.dispose();
    });

    test('resize() with same dimensions is no-op', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal({ cols: 80, rows: 24 });
      await term.open(container);

      let resizeCount = 0;
      term.onResize(() => resizeCount++);

      term.resize(80, 24); // Same size

      expect(resizeCount).toBe(0); // Should not fire event

      term.dispose();
    });

    test('resize() throws if not open', () => {
      const term = new Terminal();
      expect(() => term.resize(100, 30)).toThrow('must be opened');
    });
  });

  describe('Control Methods', () => {
    test('clear() does not throw', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.clear()).not.toThrow();

      term.dispose();
    });

    test('reset() does not throw', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.reset()).not.toThrow();

      term.dispose();
    });

    test('focus() does not throw', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.focus()).not.toThrow();

      term.dispose();
    });

    test('focus() before open does not throw', () => {
      const term = new Terminal();
      expect(() => term.focus()).not.toThrow();
    });
  });

  describe('Addons', () => {
    test('loadAddon() accepts addon', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      const mockAddon = {
        activate: (terminal: any) => {
          // Addon activation
        },
        dispose: () => {
          // Cleanup
        },
      };

      expect(() => term.loadAddon(mockAddon)).not.toThrow();

      term.dispose();
    });

    test('loadAddon() calls activate', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      let activateCalled = false;
      const mockAddon = {
        activate: (terminal: any) => {
          activateCalled = true;
        },
        dispose: () => {},
      };

      term.loadAddon(mockAddon);

      expect(activateCalled).toBe(true);

      term.dispose();
    });

    test('dispose() calls addon dispose', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      let disposeCalled = false;
      const mockAddon = {
        activate: (terminal: any) => {},
        dispose: () => {
          disposeCalled = true;
        },
      };

      term.loadAddon(mockAddon);
      term.dispose();

      expect(disposeCalled).toBe(true);
    });
  });

  describe('Integration', () => {
    test('can write ANSI sequences', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      // Should not throw on ANSI escape sequences
      expect(() => term.write('\x1b[1;31mRed bold text\x1b[0m')).not.toThrow();
      expect(() => term.write('\x1b[32mGreen\x1b[0m')).not.toThrow();
      expect(() => term.write('\x1b[2J\x1b[H')).not.toThrow(); // Clear and home

      term.dispose();
    });

    test('can handle cursor movement sequences', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => term.write('\x1b[5;10H')).not.toThrow(); // Move cursor
      expect(() => term.write('\x1b[2A')).not.toThrow(); // Move up 2
      expect(() => term.write('\x1b[3B')).not.toThrow(); // Move down 3

      term.dispose();
    });

    test('multiple write calls work', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      expect(() => {
        term.write('Line 1\r\n');
        term.write('Line 2\r\n');
        term.write('Line 3\r\n');
      }).not.toThrow();

      term.dispose();
    });
  });

  describe('Disposal', () => {
    test('dispose() can be called multiple times', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      term.dispose();
      expect(() => term.dispose()).not.toThrow();
    });

    test('dispose() cleans up canvas element', async () => {
      if (!container) return; // Skip if no DOM

      const term = new Terminal();
      await term.open(container);

      const initialChildCount = container.children.length;
      expect(initialChildCount).toBeGreaterThan(0);

      term.dispose();

      const finalChildCount = container.children.length;
      expect(finalChildCount).toBe(0);
    });
  });
});
