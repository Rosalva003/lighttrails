# How to Check Browser Console for Errors

## Quick Steps:

1. **Open your browser** and navigate to `http://localhost:3000`

2. **Open Developer Tools:**
   - **Chrome/Edge**: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - **Firefox**: Press `F12` or `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)
   - **Safari**: Press `Cmd+Option+I` (need to enable Developer menu first)

3. **Go to Console Tab** - Click on the "Console" tab in the developer tools

4. **Look for:**
   - ❌ **Red errors** - These are critical issues that need fixing
   - ⚠️ **Yellow warnings** - These are non-critical but worth noting
   - ℹ️ **Blue info logs** - Normal operation messages

## Expected Console Messages (Normal):

✅ **Good messages you should see:**
- `Connected to WebSocket server`
- `Your client ID: client_...`
- `Welcome to LightTrails!`

## Common Errors to Watch For:

❌ **If you see these, there's a problem:**
- `Canvas element not found!` - HTML structure issue
- `WebSocket connection failed` - Server not running
- `Error parsing message` - Data format issue
- `Cannot read property '...' of null` - Missing DOM element

## Quick Test:

Open the console and type:
```javascript
// Check if client is initialized
window.lightTrailsClient

// Check WebSocket connection
// (This will be available if you expose it)
```

## Current Status:

The code now includes error handling that will:
- ✅ Log warnings if DOM elements are missing
- ✅ Handle WebSocket errors gracefully
- ✅ Prevent crashes from null references
- ✅ Show helpful error messages in console

