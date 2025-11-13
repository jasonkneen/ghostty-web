/**
 * File Browser WebSocket Server
 *
 * Provides a WebSocket server that executes real shell commands
 * and allows full filesystem navigation.
 *
 * ⚠️  WARNING: This server has FULL filesystem access.
 *     Only run locally for development/demo purposes.
 *     DO NOT expose to untrusted users or networks.
 *
 * Usage:
 *   bun run file-browser-server.ts
 */

import { spawn } from 'child_process';
import { homedir } from 'os';
import { join, resolve } from 'path';

// ============================================================================
// Configuration
// ============================================================================

const PORT = 3001;
const DEFAULT_CWD = process.cwd();

// Session storage: maps client ID to session data
interface Session {
  cwd: string;
  id: string;
}

const sessions = new Map<any, Session>();

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute a shell command and return output
 */
async function executeCommand(
  command: string,
  cwd: string
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  newCwd: string;
}> {
  const trimmedCmd = command.trim();

  // Handle empty command
  if (!trimmedCmd) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      newCwd: cwd,
    };
  }

  // Handle 'clear' command (client-side handling)
  if (trimmedCmd === 'clear') {
    return {
      stdout: '\x1b[2J\x1b[H', // Clear screen + move cursor to top
      stderr: '',
      exitCode: 0,
      newCwd: cwd,
    };
  }

  // Handle 'cd' command specially (changes session state)
  if (trimmedCmd.startsWith('cd ') || trimmedCmd === 'cd') {
    const args = trimmedCmd.split(/\s+/);
    let targetDir = args[1] || homedir();

    // Handle special cases
    if (targetDir === '~') {
      targetDir = homedir();
    } else if (targetDir === '-') {
      // cd - (go back) - not implemented, just stay in current dir
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        newCwd: cwd,
      };
    } else if (!targetDir.startsWith('/')) {
      // Relative path
      targetDir = resolve(cwd, targetDir);
    }

    // Check if directory exists
    try {
      const fs = await import('fs/promises');
      const stat = await fs.stat(targetDir);
      if (stat.isDirectory()) {
        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          newCwd: targetDir,
        };
      } else {
        return {
          stdout: '',
          stderr: `cd: not a directory: ${targetDir}\n`,
          exitCode: 1,
          newCwd: cwd,
        };
      }
    } catch (error: any) {
      return {
        stdout: '',
        stderr: `cd: no such file or directory: ${targetDir}\n`,
        exitCode: 1,
        newCwd: cwd,
      };
    }
  }

  // Handle 'exit' command
  if (trimmedCmd === 'exit' || trimmedCmd === 'quit') {
    return {
      stdout: 'Goodbye!\n',
      stderr: '',
      exitCode: 0,
      newCwd: cwd,
    };
  }

  // Execute regular command
  return new Promise((resolve) => {
    // Parse command and args (simple split - doesn't handle quotes properly)
    const parts = trimmedCmd.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      cwd: cwd,
      shell: true, // Use shell to handle pipes, redirects, etc.
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1',
        CLICOLOR_FORCE: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      resolve({
        stdout: '',
        stderr: `Error executing command: ${error.message}\n`,
        exitCode: 1,
        newCwd: cwd,
      });
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
        newCwd: cwd,
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve({
        stdout: stdout,
        stderr: stderr + '\nCommand timed out after 30 seconds\n',
        exitCode: 124,
        newCwd: cwd,
      });
    }, 30000);
  });
}

// ============================================================================
// WebSocket Server
// ============================================================================

let server: any;

try {
  server = Bun.serve({
    port: PORT,

    async fetch(req, server) {
      // Upgrade HTTP request to WebSocket
      const url = new URL(req.url);

      if (url.pathname === '/ws') {
        const success = server.upgrade(req);
        if (success) {
          return undefined;
        }
        return new Response('WebSocket upgrade failed', { status: 500 });
      }

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response('OK', { status: 200 });
      }

      return new Response('File Browser WebSocket Server\n\nConnect to ws://localhost:3001/ws', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    },

    websocket: {
      open(ws) {
        // Create new session for this client
        const session: Session = {
          cwd: DEFAULT_CWD,
          id: Math.random().toString(36).substring(7),
        };
        sessions.set(ws, session);

        console.log(`[${session.id}] Client connected`);

        // Send welcome message
        ws.send(
          JSON.stringify({
            type: 'connected',
            cwd: session.cwd,
            message: 'Connected to File Browser Server',
          })
        );
      },

      async message(ws, message) {
        const session = sessions.get(ws);
        if (!session) {
          ws.send(
            JSON.stringify({
              type: 'error',
              data: 'Session not found',
            })
          );
          return;
        }

        try {
          const data = JSON.parse(message as string);

          if (data.type === 'command') {
            const command = data.data;
            console.log(`[${session.id}] Executing: ${command} (cwd: ${session.cwd})`);

            const result = await executeCommand(command, session.cwd);

            // Update session CWD if it changed
            session.cwd = result.newCwd;

            // Send result back to client
            ws.send(
              JSON.stringify({
                type: 'output',
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                cwd: session.cwd,
              })
            );

            // Handle 'exit' command
            if (command.trim() === 'exit' || command.trim() === 'quit') {
              ws.close();
            }
          }
        } catch (error: any) {
          console.error(`[${session?.id}] Error:`, error);
          ws.send(
            JSON.stringify({
              type: 'error',
              data: `Server error: ${error.message}`,
            })
          );
        }
      },

      close(ws) {
        const session = sessions.get(ws);
        if (session) {
          console.log(`[${session.id}] Client disconnected`);
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
  console.log('🚀 File Browser WebSocket Server');
  console.log('='.repeat(60));
  console.log(`\n📡 WebSocket URL: ws://localhost:${PORT}/ws`);
  console.log(`🌐 HTTP URL:      http://localhost:${PORT}`);
  console.log(`📁 Starting CWD:  ${DEFAULT_CWD}`);
  console.log('\n⚠️  WARNING: This server has FULL filesystem access!');
  console.log('   Only use for local development/demo purposes.');
  console.log('   DO NOT expose to untrusted users or networks.\n');
  console.log('='.repeat(60));
  console.log('Server is running. Press Ctrl+C to stop.\n');
} catch (error: any) {
  console.error('\n❌ Failed to start server!\n');

  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('\nTo fix this:');
    console.error(`  1. Kill the existing process: fuser -k ${PORT}/tcp`);
    console.error(`  2. Or use a different port by changing PORT in the code`);
    console.error(`  3. Or use: bun run start (auto-kills existing process)\n`);
  } else {
    console.error('Error:', error.message);
  }

  process.exit(1);
}
