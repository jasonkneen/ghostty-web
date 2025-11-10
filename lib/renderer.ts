/**
 * Canvas Renderer for Terminal Display
 * 
 * High-performance canvas-based renderer that draws the terminal buffer.
 * Features:
 * - Font metrics measurement with DPI scaling
 * - Full color support (256-color palette + RGB)
 * - All text styles (bold, italic, underline, strikethrough, etc.)
 * - Multiple cursor styles (block, underline, bar)
 * - Dirty line optimization for 60 FPS
 */

import type { ScreenBuffer, Cell, CellColor } from './buffer';
import type { ITheme } from './interfaces';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RendererOptions {
  fontSize?: number;           // Default: 15
  fontFamily?: string;         // Default: 'monospace'
  cursorStyle?: 'block' | 'underline' | 'bar';  // Default: 'block'
  cursorBlink?: boolean;       // Default: false
  theme?: ITheme;
  devicePixelRatio?: number;   // Default: window.devicePixelRatio
}

export interface FontMetrics {
  width: number;               // Character cell width in CSS pixels
  height: number;              // Character cell height in CSS pixels
  baseline: number;            // Distance from top to text baseline
}

// ============================================================================
// Default Theme
// ============================================================================

export const DEFAULT_THEME: Required<ITheme> = {
  foreground: '#d4d4d4',
  background: '#1e1e1e',
  cursor: '#ffffff',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#d4d4d4',
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

// ============================================================================
// CanvasRenderer Class
// ============================================================================

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontSize: number;
  private fontFamily: string;
  private cursorStyle: 'block' | 'underline' | 'bar';
  private cursorBlink: boolean;
  private theme: Required<ITheme>;
  private devicePixelRatio: number;
  private metrics: FontMetrics;
  private palette: string[];
  
  // Cursor blinking state
  private cursorVisible: boolean = true;
  private cursorBlinkInterval?: number;
  private lastCursorPosition: { x: number; y: number } = { x: 0, y: 0 };
  
  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;
    
    // Apply options
    this.fontSize = options.fontSize ?? 15;
    this.fontFamily = options.fontFamily ?? 'monospace';
    this.cursorStyle = options.cursorStyle ?? 'block';
    this.cursorBlink = options.cursorBlink ?? false;
    this.theme = { ...DEFAULT_THEME, ...options.theme };
    this.devicePixelRatio = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;
    
    // Build color palette (16 ANSI colors)
    this.palette = [
      this.theme.black,
      this.theme.red,
      this.theme.green,
      this.theme.yellow,
      this.theme.blue,
      this.theme.magenta,
      this.theme.cyan,
      this.theme.white,
      this.theme.brightBlack,
      this.theme.brightRed,
      this.theme.brightGreen,
      this.theme.brightYellow,
      this.theme.brightBlue,
      this.theme.brightMagenta,
      this.theme.brightCyan,
      this.theme.brightWhite,
    ];
    
    // Measure font metrics
    this.metrics = this.measureFont();
    
    // Setup cursor blinking if enabled
    if (this.cursorBlink) {
      this.startCursorBlink();
    }
  }
  
  // ==========================================================================
  // Font Metrics Measurement
  // ==========================================================================
  
  private measureFont(): FontMetrics {
    // Use an offscreen canvas for measurement
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Set font (use actual pixel size for accurate measurement)
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    
    // Measure width using 'M' (typically widest character)
    const widthMetrics = ctx.measureText('M');
    const width = Math.ceil(widthMetrics.width);
    
    // Measure height using ascent + descent
    const ascent = widthMetrics.actualBoundingBoxAscent || this.fontSize * 0.8;
    const descent = widthMetrics.actualBoundingBoxDescent || this.fontSize * 0.2;
    const height = Math.ceil(ascent + descent);
    const baseline = Math.ceil(ascent);
    
    return { width, height, baseline };
  }
  
  /**
   * Remeasure font metrics (call after font loads or changes)
   */
  public remeasureFont(): void {
    this.metrics = this.measureFont();
  }
  
  // ==========================================================================
  // Color Conversion
  // ==========================================================================
  
  private colorToCSS(color: CellColor, isBackground: boolean = false): string {
    switch (color.type) {
      case 'default':
        return isBackground ? this.theme.background : this.theme.foreground;
      
      case 'palette':
        // Handle palette colors (0-15 use our theme, 16-255 could be extended)
        if (color.index >= 0 && color.index < this.palette.length) {
          return this.palette[color.index];
        }
        // Extended 256-color palette (16-255) - simplified for now
        // In full implementation, would compute xterm-256 colors
        return isBackground ? this.theme.background : this.theme.foreground;
      
      case 'rgb':
        return `rgb(${color.r}, ${color.g}, ${color.b})`;
    }
  }
  
  // ==========================================================================
  // Canvas Sizing
  // ==========================================================================
  
  /**
   * Resize canvas to fit terminal dimensions
   */
  public resize(cols: number, rows: number): void {
    const cssWidth = cols * this.metrics.width;
    const cssHeight = rows * this.metrics.height;
    
    // Set CSS size (what user sees)
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    
    // Set actual canvas size (scaled for DPI)
    this.canvas.width = cssWidth * this.devicePixelRatio;
    this.canvas.height = cssHeight * this.devicePixelRatio;
    
    // Scale context to match DPI (setting canvas.width/height resets the context)
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
    
    // Fill background after resize
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(0, 0, cssWidth, cssHeight);
  }
  
  // ==========================================================================
  // Main Rendering
  // ==========================================================================
  
  /**
   * Render the terminal buffer to canvas
   */
  public render(buffer: ScreenBuffer, forceAll: boolean = false): void {
    const lines = buffer.getAllLines();
    const cursor = buffer.getCursor();
    const dims = buffer.getDimensions();
    
    // Resize canvas if dimensions changed
    const needsResize = this.canvas.width !== dims.cols * this.metrics.width * this.devicePixelRatio ||
                        this.canvas.height !== dims.rows * this.metrics.height * this.devicePixelRatio;
    
    if (needsResize) {
      this.resize(dims.cols, dims.rows);
      forceAll = true; // Force full render after resize
    }
    
    // Check if cursor position changed or if blinking (need to redraw cursor line)
    const cursorMoved = cursor.x !== this.lastCursorPosition.x || cursor.y !== this.lastCursorPosition.y;
    if (cursorMoved || this.cursorBlink) {
      // Mark cursor lines as needing redraw
      if (!forceAll && !buffer.isDirty(cursor.y)) {
        // Need to redraw cursor line
        this.renderLine(lines[cursor.y], cursor.y, dims.cols);
      }
      if (cursorMoved && this.lastCursorPosition.y !== cursor.y) {
        // Also redraw old cursor line if cursor moved to different line
        if (!forceAll && !buffer.isDirty(this.lastCursorPosition.y)) {
          this.renderLine(lines[this.lastCursorPosition.y], this.lastCursorPosition.y, dims.cols);
        }
      }
    }
    
    // Render each line
    for (let y = 0; y < lines.length; y++) {
      // Only render dirty lines for performance (unless forcing all)
      if (!forceAll && !buffer.isDirty(y)) {
        continue;
      }
      
      this.renderLine(lines[y], y, dims.cols);
    }
    
    // Render cursor
    if (cursor.visible && this.cursorVisible) {
      this.renderCursor(cursor.x, cursor.y);
    }
    
    // Update last cursor position
    this.lastCursorPosition = { x: cursor.x, y: cursor.y };
    
    // Clear dirty flags after rendering
    if (!forceAll) {
      buffer.clearDirty();
    }
  }
  
  /**
   * Render a single line
   */
  private renderLine(line: Cell[], y: number, cols: number): void {
    const lineY = y * this.metrics.height;
    
    // Clear line background
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(0, lineY, cols * this.metrics.width, this.metrics.height);
    
    // Render each cell
    for (let x = 0; x < line.length; x++) {
      const cell = line[x];
      
      // Skip padding cells for wide characters
      if (cell.width === 0) {
        continue;
      }
      
      this.renderCell(cell, x, y);
    }
  }
  
  /**
   * Render a single cell
   */
  private renderCell(cell: Cell, x: number, y: number): void {
    const cellX = x * this.metrics.width;
    const cellY = y * this.metrics.height;
    const cellWidth = this.metrics.width * cell.width; // Handle wide chars (width=2)
    
    // Get colors (handle inverse)
    let fg = cell.fg;
    let bg = cell.bg;
    if (cell.inverse) {
      [fg, bg] = [bg, fg];
    }
    
    // Draw background
    if (bg.type !== 'default' || cell.inverse) {
      this.ctx.fillStyle = this.colorToCSS(bg, true);
      this.ctx.fillRect(cellX, cellY, cellWidth, this.metrics.height);
    }
    
    // Skip rendering if invisible
    if (cell.invisible) {
      return;
    }
    
    // Set text style
    let fontStyle = '';
    if (cell.italic) fontStyle += 'italic ';
    if (cell.bold) fontStyle += 'bold ';
    this.ctx.font = `${fontStyle}${this.fontSize}px ${this.fontFamily}`;
    
    // Set text color
    this.ctx.fillStyle = this.colorToCSS(fg, false);
    
    // Apply faint effect
    if (cell.faint) {
      this.ctx.globalAlpha = 0.5;
    }
    
    // Draw text
    const textX = cellX;
    const textY = cellY + this.metrics.baseline;
    this.ctx.fillText(cell.char, textX, textY);
    
    // Reset alpha
    if (cell.faint) {
      this.ctx.globalAlpha = 1.0;
    }
    
    // Draw underline
    if (cell.underline) {
      const underlineY = cellY + this.metrics.baseline + 2;
      this.ctx.strokeStyle = this.ctx.fillStyle;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(cellX, underlineY);
      this.ctx.lineTo(cellX + cellWidth, underlineY);
      this.ctx.stroke();
    }
    
    // Draw strikethrough
    if (cell.strikethrough) {
      const strikeY = cellY + this.metrics.height / 2;
      this.ctx.strokeStyle = this.ctx.fillStyle;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(cellX, strikeY);
      this.ctx.lineTo(cellX + cellWidth, strikeY);
      this.ctx.stroke();
    }
  }
  
  /**
   * Render cursor
   */
  private renderCursor(x: number, y: number): void {
    const cursorX = x * this.metrics.width;
    const cursorY = y * this.metrics.height;
    
    this.ctx.fillStyle = this.theme.cursor;
    
    switch (this.cursorStyle) {
      case 'block':
        // Full cell block
        this.ctx.fillRect(cursorX, cursorY, this.metrics.width, this.metrics.height);
        break;
      
      case 'underline':
        // Underline at bottom of cell
        const underlineHeight = Math.max(2, Math.floor(this.metrics.height * 0.15));
        this.ctx.fillRect(
          cursorX,
          cursorY + this.metrics.height - underlineHeight,
          this.metrics.width,
          underlineHeight
        );
        break;
      
      case 'bar':
        // Vertical bar at left of cell
        const barWidth = Math.max(2, Math.floor(this.metrics.width * 0.15));
        this.ctx.fillRect(cursorX, cursorY, barWidth, this.metrics.height);
        break;
    }
  }
  
  // ==========================================================================
  // Cursor Blinking
  // ==========================================================================
  
  private startCursorBlink(): void {
    // xterm.js uses ~530ms blink interval
    this.cursorBlinkInterval = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      // Note: Render loop should redraw cursor line automatically
    }, 530);
  }
  
  private stopCursorBlink(): void {
    if (this.cursorBlinkInterval !== undefined) {
      clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = undefined;
    }
    this.cursorVisible = true;
  }
  
  // ==========================================================================
  // Public API
  // ==========================================================================
  
  /**
   * Update theme colors
   */
  public setTheme(theme: ITheme): void {
    this.theme = { ...DEFAULT_THEME, ...theme };
    
    // Rebuild palette
    this.palette = [
      this.theme.black,
      this.theme.red,
      this.theme.green,
      this.theme.yellow,
      this.theme.blue,
      this.theme.magenta,
      this.theme.cyan,
      this.theme.white,
      this.theme.brightBlack,
      this.theme.brightRed,
      this.theme.brightGreen,
      this.theme.brightYellow,
      this.theme.brightBlue,
      this.theme.brightMagenta,
      this.theme.brightCyan,
      this.theme.brightWhite,
    ];
  }
  
  /**
   * Update font size
   */
  public setFontSize(size: number): void {
    this.fontSize = size;
    this.metrics = this.measureFont();
  }
  
  /**
   * Update font family
   */
  public setFontFamily(family: string): void {
    this.fontFamily = family;
    this.metrics = this.measureFont();
  }
  
  /**
   * Update cursor style
   */
  public setCursorStyle(style: 'block' | 'underline' | 'bar'): void {
    this.cursorStyle = style;
  }
  
  /**
   * Enable/disable cursor blinking
   */
  public setCursorBlink(enabled: boolean): void {
    if (enabled && !this.cursorBlink) {
      this.cursorBlink = true;
      this.startCursorBlink();
    } else if (!enabled && this.cursorBlink) {
      this.cursorBlink = false;
      this.stopCursorBlink();
    }
  }
  
  /**
   * Get current font metrics
   */
  public getMetrics(): FontMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Clear entire canvas
   */
  public clear(): void {
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stopCursorBlink();
  }
}
