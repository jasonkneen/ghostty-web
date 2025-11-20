# Known Issues with npx ghostty-web

## Vim Keyboard Commands Not Working

**Issue**: In vim, certain commands like `0` (go to beginning of line) and `15gg` (go to line 15) don't work correctly.

**Status**: Under investigation

**What Works**:
- Basic typing and insert mode work fine
- Arrow keys for navigation work
- Most vim commands work
- The working demo (`demo/` with separate PTY server) works perfectly

**What Doesn't Work**:
- `0` - go to beginning of line
- Specific line navigation like `15gg`
- Possibly other multi-key commands

**Investigation So Far**:
1. ✓ HTML/CSS/JS client code is now **identical** to working demo
2. ✓ PTY server code matches demo/server implementation (using `script` command, OSC filtering, stty sizing)
3. ✓ Data is flowing correctly (confirmed '0' is being sent and received)
4. ✓ Same library files (dist/ghostty-web.js) are being used

**Suspected Root Cause**:
The custom **MinimalWebSocket implementation** in `bin/ghostty-web.js` may have subtle bugs in frame handling or buffering that cause issues with rapid key sequences or specific characters.

The working demo uses **Bun's native WebSocket server**, which is battle-tested and handles all edge cases correctly.

**Workaround**:
For full functionality, use the complete demo setup:
```bash
# Terminal 1 - PTY Server
cd demo/server
bun run start

# Terminal 2 - Web Server  
bun run dev

# Browser
http://localhost:8000/demo/
```

**Potential Fixes**:
1. **Use a real WebSocket library** - Add `ws` as an optional dependency
2. **Debug MinimalWebSocket** - Add extensive logging to find the bug
3. **Use HTTP long-polling** - Less elegant but dependency-free alternative
4. **Document limitation** - Clearly state that some advanced features require the full demo

**Next Steps**:
- Test if adding `ws` package fixes the issue
- If yes: Decide whether to add it as a dependency or keep as limitation
- If no: Debug further to find the actual cause

