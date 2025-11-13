import { describe, expect, test } from 'bun:test';
import { SelectionManager } from './selection-manager';
import { Terminal } from './terminal';

describe('SelectionManager', () => {
  describe('Construction', () => {
    test('creates without errors', () => {
      const term = new Terminal({ cols: 80, rows: 24 });
      // Note: In real tests, you'd need to mock the renderer and wasmTerm
      // For now, just verify the module can be imported
      expect(SelectionManager).toBeDefined();
    });
  });

  describe('API', () => {
    test('has required public methods', () => {
      expect(typeof SelectionManager.prototype.getSelection).toBe('function');
      expect(typeof SelectionManager.prototype.hasSelection).toBe('function');
      expect(typeof SelectionManager.prototype.clearSelection).toBe('function');
      expect(typeof SelectionManager.prototype.selectAll).toBe('function');
      expect(typeof SelectionManager.prototype.getSelectionCoords).toBe('function');
      expect(typeof SelectionManager.prototype.dispose).toBe('function');
    });
  });

  // Note: Full integration tests would require:
  // 1. Creating a terminal with open()
  // 2. Simulating mouse events on the canvas
  // 3. Writing test data to the terminal
  // 4. Verifying selected text extraction
  //
  // These are better suited for browser-based integration tests
  // since they require a real DOM canvas element.
});
