/**
 * PTY Shell Server
 *
 * Provides a WebSocket server with real PTY shell sessions.
 * Each client gets their own persistent shell session.
 *
 * ⚠️  WARNING: This server provides FULL shell access.
 *     Only run locally for development/demo purposes.
 *     DO NOT expose to untrusted users or networks.
 *
 * Usage:
 *   bun run pty-server.ts
 */

import { spawn } from 'child_process';
import { homedir } from 'os';

// ============================================================================
// Configuration
// ============================================================================

const PORT = 3001;
const SHELL = process.env.SHELL || '/bin/bash';

// Session storage: maps WebSocket to PTY process
interface Session {
  id: string;
  ptyProcess: any;
  cwd: string;
}

const sessions = new Map<any, Session>();

// ============================================================================
// PTY Shell Creation
// ============================================================================

/**
 * Create a PTY shell session
 */
function createShell(cwd: string = process.cwd(), cols: number = 80, rows: number = 24) {
  // Use 'script' command to create a real PTY
  console.log(`Creating PTY shell with size ${cols}x${rows}`);

  // script -q -c "bash" /dev/null creates a PTY running bash
  const shell = spawn('script', ['-qfc', SHELL, '/dev/null'], {
    cwd: cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      PS1: '\\[\\033[1;32m\\]\\w\\[\\033[0m\\] $ ',
      // Disable some escape sequences that cause artifacts
      PROMPT_COMMAND: '', // Disable dynamic prompt command
      // Set terminal size via environment variables (vim and other apps read these)
      COLUMNS: String(cols),
      LINES: String(rows),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  console.log(`Spawned shell via script command (pid: ${shell.pid})`);

  if (shell.stdout) {
    shell.stdout.setEncoding('utf8');
  }
  if (shell.stderr) {
    shell.stderr.setEncoding('utf8');
  }

  return shell;
}

// ============================================================================
// WebSocket Server
// ============================================================================

const server = Bun.serve({
  port: PORT,

  async fetch(req, server) {
    // Upgrade HTTP request to WebSocket
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      // Parse terminal size from query parameters before upgrade
      const cols = Number.parseInt(url.searchParams.get('cols') || '80');
      const rows = Number.parseInt(url.searchParams.get('rows') || '24');

      // Pass size data to WebSocket via upgrade data
      const success = server.upgrade(req, {
        data: { cols, rows },
      });
      if (success) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('PTY Shell WebSocket Server\n\nConnect to ws://localhost:3001/ws', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },

  websocket: {
    open(ws) {
      // Get terminal size from WebSocket data (set during upgrade)
      const { cols, rows } = (ws.data as any) || { cols: 80, rows: 24 };

      console.log(`Client requested terminal size: ${cols}x${rows}`);

      // Create new shell session for this client
      const sessionId = Math.random().toString(36).substring(7);
      const shell = createShell(homedir(), cols, rows);

      const session: Session = {
        id: sessionId,
        ptyProcess: shell,
        cwd: homedir(),
      };

      sessions.set(ws, session);
      console.log(`[${session.id}] Client connected - spawned ${SHELL}`);

      // Forward shell output to WebSocket
      shell.stdout.on('data', (data: Buffer) => {
        let str = data.toString();

        // Filter out OSC sequences that cause artifacts
        // OSC 0 = Set icon name and window title
        // OSC 1 = Set icon name
        // OSC 2 = Set window title
        str = str.replace(/\x1b\]0;[^\x07]*\x07/g, ''); // OSC 0
        str = str.replace(/\x1b\]1;[^\x07]*\x07/g, ''); // OSC 1
        str = str.replace(/\x1b\]2;[^\x07]*\x07/g, ''); // OSC 2

        console.log(
          `[${session.id}] Shell stdout (${str.length} bytes):`,
          JSON.stringify(str.substring(0, 100))
        );
        try {
          ws.send(str);
        } catch (error) {
          console.error(`[${session.id}] Error sending stdout:`, error);
        }
      });

      shell.stderr.on('data', (data: Buffer) => {
        try {
          // Send stderr in red
          ws.send(`\x1b[31m${data.toString()}\x1b[0m`);
        } catch (error) {
          console.error(`[${session.id}] Error sending stderr:`, error);
        }
      });

      // Handle shell exit
      shell.on('exit', (code: number) => {
        console.log(`[${session.id}] Shell exited with code ${code}`);
        try {
          ws.send(`\r\n\x1b[1;33mShell session ended (exit code: ${code})\x1b[0m\r\n`);
          ws.close();
        } catch (error) {
          // WebSocket might already be closed
        }
        sessions.delete(ws);
      });

      // Send stty command to resize the PTY
      // This runs inside the shell and sets the actual PTY size
      // Clear the line after to hide the command echo
      console.log(`[${session.id}] Setting PTY size via stty`);
      shell.stdin.write(`stty cols ${cols} rows ${rows}; clear\n`);

      // Wait a bit for stty to execute, then send welcome
      setTimeout(() => {
        console.log(`[${session.id}] Sending welcome message to client`);
        ws.send('TEST: WebSocket is working!\r\n');
        ws.send(
          '\x1b[1;36m╔══════════════════════════════════════════════════════════════╗\x1b[0m\r\n'
        );
        ws.send(
          '\x1b[1;36m║\x1b[0m  \x1b[1;32mWelcome to Ghostty Terminal!\x1b[0m                             \x1b[1;36m║\x1b[0m\r\n'
        );
        ws.send(
          '\x1b[1;36m║\x1b[0m                                                              \x1b[1;36m║\x1b[0m\r\n'
        );
        ws.send(
          '\x1b[1;36m║\x1b[0m  You now have a real shell session with full PTY support.   \x1b[1;36m║\x1b[0m\r\n'
        );
        ws.send(
          '\x1b[1;36m║\x1b[0m  Try: \x1b[1;33mls\x1b[0m, \x1b[1;33mcd\x1b[0m, \x1b[1;33mtop\x1b[0m, \x1b[1;33mvim\x1b[0m, or any command!              \x1b[1;36m║\x1b[0m\r\n'
        );
        ws.send(
          '\x1b[1;36m╚══════════════════════════════════════════════════════════════╝\x1b[0m\r\n'
        );
        ws.send('\r\n');
        console.log(`[${session.id}] Welcome message sent`);
      }, 100);
    },

    message(ws, message) {
      const session = sessions.get(ws);
      if (!session) {
        ws.send('\r\n\x1b[31mError: Session not found\x1b[0m\r\n');
        return;
      }

      try {
        const input = message.toString();

        // Check if it's a resize message (JSON format: {"type":"resize","cols":N,"rows":N})
        if (input.startsWith('{')) {
          try {
            const msg = JSON.parse(input);
            if (msg.type === 'resize') {
              console.log(`[${session.id}] Resize request: ${msg.cols}x${msg.rows}`);
              // Note: 'script' command doesn't support dynamic resize,
              // but we log it for debugging. Use node-pty for full resize support.
              return;
            }
          } catch (e) {
            // Not JSON, treat as regular input
          }
        }

        // Forward input to shell stdin
        console.log(`[${session.id}] Received input:`, JSON.stringify(input));
        session.ptyProcess.stdin.write(input);
      } catch (error: any) {
        console.error(`[${session.id}] Error writing to shell:`, error);
        ws.send(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
      }
    },

    close(ws) {
      const session = sessions.get(ws);
      if (session) {
        console.log(`[${session.id}] Client disconnected`);

        // Kill the shell process
        try {
          session.ptyProcess.kill();
        } catch (error) {
          console.error(`[${session.id}] Error killing shell:`, error);
        }

        sessions.delete(ws);
      }
    },

    error(ws, error) {
      const session = sessions.get(ws);
      console.error(`[${session?.id}] WebSocket error:`, error);
    },
  },
});

// ============================================================================
// Startup
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('🚀 PTY Shell WebSocket Server');
console.log('='.repeat(60));
console.log(`\n📡 WebSocket URL: ws://localhost:${PORT}/ws`);
console.log(`🌐 HTTP URL:      http://localhost:${PORT}`);
console.log(`🐚 Shell:         ${SHELL}`);
console.log(`📁 Starting Dir:  ${homedir()}`);
console.log('\n⚠️  WARNING: This server provides FULL shell access!');
console.log('   Only use for local development/demo purposes.');
console.log('   DO NOT expose to untrusted users or networks.\n');
console.log('='.repeat(60));
console.log('Server is running. Press Ctrl+C to stop.\n');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');

  // Kill all active shell sessions
  for (const [ws, session] of sessions.entries()) {
    console.log(`Killing shell session ${session.id}`);
    try {
      session.ptyProcess.kill();
      ws.close();
    } catch (error) {
      // Ignore errors during shutdown
    }
  }

  process.exit(0);
});
