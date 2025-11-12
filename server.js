const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer((req, res) => {
  // Serve the client HTML file
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/client.js') {
    fs.readFile(path.join(__dirname, 'public', 'client.js'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading client.js');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Create WebSocket server with configuration
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false, // Disable compression for lower latency
  clientTracking: true // Enable built-in client tracking
});

// Store all connected clients with metadata
const clients = new Map();

// Connection health check interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;
const CONNECTION_TIMEOUT = 10000;
const METEOR_MIN_INTERVAL = 60000;
const METEOR_MAX_INTERVAL = 120000;

const METEOR_COLORS = [
  '#ffb6c1',
  '#ffd6e8',
  '#c8a8f8',
  '#98b9ff',
  '#d6a8ff',
  '#a8d8ff'
];

const DEFAULT_SETTINGS = {
  color: '#ff6b6b',
  size: 1,
  glow: 1.2,
  cursorMode: 'halo',
  username: ''
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function sanitizeSettings(settings = {}, fallback = DEFAULT_SETTINGS) {
  const sanitized = {};

  sanitized.color = typeof settings.color === 'string' && settings.color.trim()
    ? settings.color.trim()
    : fallback.color || DEFAULT_SETTINGS.color;

  const sizeValue = typeof settings.size === 'number' ? settings.size : fallback.size;
  sanitized.size = clamp(sizeValue ?? DEFAULT_SETTINGS.size, 0.5, 3);

  const glowValue = typeof settings.glow === 'number' ? settings.glow : fallback.glow;
  sanitized.glow = clamp(glowValue ?? DEFAULT_SETTINGS.glow, 0.5, 3);

  const cursorModeValue = settings.cursorMode || fallback.cursorMode || DEFAULT_SETTINGS.cursorMode;
  sanitized.cursorMode = cursorModeValue === 'star' ? 'star' : 'halo';

  if (typeof settings.username === 'string' && settings.username.trim()) {
    sanitized.username = settings.username.trim().slice(0, 18);
  } else if (fallback.username && fallback.username.trim()) {
    sanitized.username = fallback.username.trim().slice(0, 18);
  } else {
    sanitized.username = '';
  }

  return sanitized;
}

wss.on('connection', (ws, req) => {
  const clientId = generateClientId();
  const clientInfo = {
    id: clientId,
    ip: req.socket.remoteAddress,
    connectedAt: Date.now(),
    lastPing: Date.now()
  };
  clientInfo.metadata = {
    ...(clientInfo.metadata || {}),
    settings: sanitizeSettings(clientInfo.metadata?.settings || {}, DEFAULT_SETTINGS)
  };
  
  clients.set(ws, clientInfo);
  console.log(`New client connected: ${clientId} from ${clientInfo.ip}`);
  console.log(`Total clients: ${clients.size}`);

  // Set connection as alive
  ws.isAlive = true;

  // Handle pong responses for heartbeat
  ws.on('pong', () => {
    ws.isAlive = true;
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      clientInfo.lastPing = Date.now();
    }
  });

  // Snapshot existing client settings for newcomer
  const settingsSnapshot = [];
  clients.forEach((info) => {
    if (info.id !== clientId) {
      const existingMetadata = info.metadata || {};
      const sanitized = sanitizeSettings(existingMetadata.settings || {}, DEFAULT_SETTINGS);
      info.metadata = {
        ...existingMetadata,
        settings: sanitized
      };
      settingsSnapshot.push({
        clientId: info.id,
        settings: sanitized
      });
    }
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Welcome to LightTrails!',
    clientId: clientId,
    clientCount: clients.size,
    metadata: clientInfo.metadata || {},
    allSettings: settingsSnapshot
  }));

  // Broadcast new client connection to all other clients
  broadcast({
    type: 'clientJoined',
    clientId: clientId,
    clientCount: clients.size,
    metadata: clientInfo.metadata || {}
  }, ws);

  // Handle incoming messages
  ws.on('message', (message, isBinary) => {
    // Only handle text messages (JSON)
    if (isBinary) {
      console.warn('Received binary message, ignoring');
      return;
    }

    try {
      const data = JSON.parse(message.toString());
      
      // Handle different message types
      switch (data.type) {
        case 'updateSettings': {
          clientInfo.metadata = clientInfo.metadata || {};
          const previousSettings = clientInfo.metadata.settings || DEFAULT_SETTINGS;
          const sanitizedSettings = sanitizeSettings(data, previousSettings);
          clientInfo.metadata.settings = sanitizedSettings;

          ws.send(JSON.stringify({
            type: 'settingsAck',
            settings: sanitizedSettings
          }));

          broadcast({
            type: 'userSettings',
            clientId,
            settings: sanitizedSettings
          }, ws);
          break;
        }
        case 'lightTrail': {
          clientInfo.metadata = clientInfo.metadata || {};
          clientInfo.metadata.settings = clientInfo.metadata.settings || DEFAULT_SETTINGS;

          const sanitizedSettings = sanitizeSettings(data, clientInfo.metadata.settings);
          clientInfo.metadata.settings = sanitizedSettings;

          // Broadcast light trail to all clients except sender
          broadcast({
            type: 'lightTrail',
            trail: data.trail,
            color: sanitizedSettings.color,
            size: sanitizedSettings.size,
            glow: sanitizedSettings.glow,
            cursorMode: sanitizedSettings.cursorMode,
            username: sanitizedSettings.username,
            clientId: clientId,
            timestamp: Date.now()
          }, ws);
          break;
        }
        
        case 'ping':
          // Respond to client ping
          ws.send(JSON.stringify({ 
            type: 'pong',
            timestamp: Date.now()
          }));
          break;
        
        case 'clear':
          // Broadcast clear canvas request
          broadcast({
            type: 'clear',
            clientId: clientId,
            timestamp: Date.now()
          }, ws);
          break;
        
        case 'mousePosition': {
          clientInfo.metadata = clientInfo.metadata || {};
          clientInfo.metadata.settings = clientInfo.metadata.settings || DEFAULT_SETTINGS;
          const sanitizedSettings = sanitizeSettings(data, clientInfo.metadata.settings);
          clientInfo.metadata.settings = sanitizedSettings;

          // Broadcast mouse position to all other clients
          broadcast({
            type: 'mousePosition',
            x: data.x,
            y: data.y,
            clientId: clientId,
            color: sanitizedSettings.color,
            size: sanitizedSettings.size,
            glow: sanitizedSettings.glow,
            cursorMode: sanitizedSettings.cursorMode,
            username: sanitizedSettings.username,
            timestamp: Date.now()
          }, ws);
          break;
        }
        
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      // Send error response to client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    }
  });

  // Handle client disconnect
  ws.on('close', (code, reason) => {
    const clientInfo = clients.get(ws);
    console.log(`Client disconnected: ${clientInfo?.id || 'unknown'} (code: ${code}, reason: ${reason.toString() || 'none'})`);
    clients.delete(ws);
    
    // Broadcast client disconnect to remaining clients
    broadcast({
      type: 'clientLeft',
      clientId: clientInfo?.id,
      clientCount: clients.size
    }, ws);
    
    console.log(`Total clients: ${clients.size}`);
  });

  // Handle errors
  ws.on('error', (error) => {
    const clientInfo = clients.get(ws);
    console.error(`WebSocket error for client ${clientInfo?.id || 'unknown'}:`, error);
  });
});

// Generate unique client ID
function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Heartbeat mechanism to detect dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    const clientInfo = clients.get(ws);
    
    if (!ws.isAlive) {
      // Connection is dead, terminate it
      console.log(`Terminating dead connection: ${clientInfo?.id || 'unknown'}`);
      clients.delete(ws);
      return ws.terminate();
    }
    
    // Mark as not alive and ping
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// Clean up interval on server shutdown
wss.on('close', () => {
  clearInterval(heartbeat);
});

// Broadcast message to all clients except sender
function broadcast(data, sender) {
  const message = JSON.stringify(data);
  let sentCount = 0;
  
  clients.forEach((clientInfo, ws) => {
    if (ws !== sender && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
        sentCount++;
      } catch (error) {
        console.error('Error sending message to client:', error);
        // Remove client if send fails
        clients.delete(ws);
      }
    }
  });
  
  return sentCount;
}

function scheduleMeteorShower() {
  const delay = METEOR_MIN_INTERVAL + Math.random() * (METEOR_MAX_INTERVAL - METEOR_MIN_INTERVAL);
  setTimeout(() => {
    launchMeteorShower();
    scheduleMeteorShower();
  }, delay);
}

function launchMeteorShower() {
  if (wss.clients.size === 0) {
    return;
  }

  const baseColor = METEOR_COLORS[Math.floor(Math.random() * METEOR_COLORS.length)];
  const event = {
    type: 'meteorShower',
    streakCount: 10 + Math.floor(Math.random() * 8),
    direction: Math.random() > 0.5 ? 'leftToRight' : 'rightToLeft',
    duration: 2.6,
    spread: 0.6,
    baseColor
  };

  console.log('Triggering meteor shower event', event);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  });
}

scheduleMeteorShower();

// Start server
server.listen(PORT, () => {
  console.log(`LightTrails WebSocket server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to connect`);
});

