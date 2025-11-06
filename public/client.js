/**
 * LightTrailsClient - WebSocket client for real-time collaborative drawing
 * 
 * Features:
 * - WebSocket connection to server for real-time communication
 * - Canvas drawing with mouse/touch support
 * - Smooth fading trails that disappear after 4 seconds
 * - Real-time cursor position broadcasting
 * - Multi-user trail rendering with distinct colors
 */
class LightTrailsClient {
  constructor() {
    this.ws = null;
    
    // Get canvas elements with error checking
    this.canvas = document.getElementById('canvas');
    if (!this.canvas) {
      console.error('Canvas element not found! Make sure #canvas exists in HTML.');
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    
    this.cursorCanvas = document.getElementById('cursorCanvas');
    if (!this.cursorCanvas) {
      console.error('Cursor canvas element not found! Make sure #cursorCanvas exists in HTML.');
      return;
    }
    this.cursorCtx = this.cursorCanvas.getContext('2d');
    
    this.isDrawing = false;
    this.currentColor = '#ff6b6b';
    this.trailPoints = [];
    this.clientId = null;
    
    // Track all users' trails: clientId -> array of {x, y, color, timestamp}
    this.allTrails = new Map();
    
    // Track other users' mouse positions
    this.otherCursors = new Map(); // clientId -> {x, y, color, timestamp}
    
    // Mouse position tracking
    this.lastMousePosition = null;
    this.mousePositionThrottle = 50; // Send position every 50ms
    this.lastMousePositionSent = 0;
    
    // Trail settings
    this.trailFadeTime = 4000; // Trails fade out over 4 seconds
    this.trailPointSpacing = 3; // Minimum distance between trail points
    this.minAlpha = 0.05; // Minimum alpha before removing (for smoother fade)
    
    // Glow and blending settings
    this.glowLayers = 3; // Number of glow layers for soft effect
    this.baseGlowRadius = 25; // Base glow radius
    this.useGradients = true; // Enable gradient colors
    
    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Initialize UI
    this.initializeUI();
    
    // Start animation loop for rendering cursors and trails
    this.startAnimationLoop();
    
    // Connect to WebSocket server
    this.connect();
  }

  resizeCanvas() {
    // Use full viewport dimensions for full-screen canvas
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.canvas.width = width;
    this.canvas.height = height;
    this.cursorCanvas.width = width;
    this.cursorCanvas.height = height;
    
    // Redraw existing trails
    this.redrawCanvas();
  }

  initializeUI() {
    // Color picker
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        this.currentColor = e.target.value;
      });
    } else {
      console.warn('Color picker element not found');
    }

    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearCanvas(true); // Send to server
      });
    } else {
      console.warn('Clear button element not found');
    }

    // Random color button
    const randomColorBtn = document.getElementById('randomColorBtn');
    if (randomColorBtn) {
      randomColorBtn.addEventListener('click', () => {
        this.currentColor = this.getRandomColor();
        if (colorPicker) colorPicker.value = this.currentColor;
      });
    } else {
      console.warn('Random color button element not found');
    }

    // Canvas drawing events
    this.setupDrawingEvents();
  }

  setupDrawingEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.draw(e);
      this.trackMousePosition(e);
    });
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => {
      this.stopDrawing();
      this.lastMousePosition = null;
    });

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });
  }

  getRandomColor() {
    // Pastel and neon gradient colors
    const colors = [
      '#ff6b9d', '#c44569', '#f8b500', '#ff6b6b', // Warm pastels
      '#4ecdc4', '#45b7d1', '#a29bfe', '#6c5ce7', // Cool pastels
      '#00b894', '#00cec9', '#fd79a8', '#fdcb6e', // Bright neons
      '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', // Vibrant neons
      '#ff6348', '#ffa502', '#ff3838', '#ff9ff3'  // Neon brights
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Generate gradient colors for a trail point
   * Creates pastel/neon gradient variations
   */
  getGradientColors(baseColor) {
    const rgb = this.hexToRgb(baseColor);
    
    // Create variations: lighter (pastel) and brighter (neon)
    const pastel = {
      r: Math.min(255, rgb.r + 50),
      g: Math.min(255, rgb.g + 50),
      b: Math.min(255, rgb.b + 50)
    };
    
    const neon = {
      r: Math.min(255, rgb.r * 1.2),
      g: Math.min(255, rgb.g * 1.2),
      b: Math.min(255, rgb.b * 1.2)
    };
    
    return {
      base: baseColor,
      pastel: `rgb(${pastel.r}, ${pastel.g}, ${pastel.b})`,
      neon: `rgb(${neon.r}, ${neon.g}, ${neon.b})`
    };
  }

  hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  startDrawing(e) {
    this.isDrawing = true;
    const coords = this.getCanvasCoordinates(e);
    this.trailPoints = [{
      x: coords.x,
      y: coords.y,
      timestamp: Date.now()
    }];
    
    // Initialize trail for this client if not exists (only if clientId is set)
    if (this.clientId) {
      if (!this.allTrails.has(this.clientId)) {
        this.allTrails.set(this.clientId, []);
      }
      
      // Add starting point to trail
      this.allTrails.get(this.clientId).push({
        x: coords.x,
        y: coords.y,
        color: this.currentColor,
        timestamp: Date.now()
      });
    }
  }

  draw(e) {
    if (!this.isDrawing) return;
    
    const coords = this.getCanvasCoordinates(e);
    const now = Date.now();
    
    // Only add point if it's far enough from last point (for smoother trails)
    if (this.trailPoints.length > 0) {
      const lastPoint = this.trailPoints[this.trailPoints.length - 1];
      const dx = coords.x - lastPoint.x;
      const dy = coords.y - lastPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.trailPointSpacing) {
        return; // Skip point if too close
      }
    }
    
    this.trailPoints.push({
      x: coords.x,
      y: coords.y,
      timestamp: now
    });
    
    // Add to local trail storage (only if clientId is set)
    if (this.clientId) {
      if (!this.allTrails.has(this.clientId)) {
        this.allTrails.set(this.clientId, []);
      }
      
      this.allTrails.get(this.clientId).push({
        x: coords.x,
        y: coords.y,
        color: this.currentColor,
        timestamp: now
      });
    }
    
    // Send trail segment to server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'lightTrail',
        trail: coords,
        color: this.currentColor
      }));
    }
  }

  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.trailPoints = [];
    }
  }

  trackMousePosition(e) {
    const coords = this.getCanvasCoordinates(e);
    this.lastMousePosition = coords;
    
    // Throttle mouse position updates
    const now = Date.now();
    if (now - this.lastMousePositionSent < this.mousePositionThrottle) {
      return;
    }
    
    this.lastMousePositionSent = now;
    
    // Send mouse position to server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'mousePosition',
        x: coords.x,
        y: coords.y,
        color: this.currentColor
      }));
    }
  }

  drawTrail(trail, color) {
    // Add incoming trail point to storage
    if (!this.allTrails.has(trail.clientId)) {
      this.allTrails.set(trail.clientId, []);
    }
    
    const trailArray = this.allTrails.get(trail.clientId);
    const point = {
      x: trail.trail.x,
      y: trail.trail.y,
      color: trail.color || color,
      timestamp: Date.now()
    };
    
    trailArray.push(point);
    
    // Limit trail length to prevent memory issues
    if (trailArray.length > 500) {
      trailArray.shift();
    }
  }

  clearCanvas(sendToServer = true) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.allTrails.clear();
    
    // Send clear request to server if not already from server
    if (sendToServer && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'clear'
      }));
    }
  }

  redrawCanvas() {
    // Clear and redraw all trails
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderAllTrails();
  }

  startAnimationLoop() {
    const animate = () => {
      // Continuously render trails and cursors
      this.renderAllTrails();
      this.renderCursors();
      requestAnimationFrame(animate);
    };
    animate();
  }

  renderAllTrails() {
    const now = Date.now();
    
    // Draw dark background with normal blend mode
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    
    // Clean up old trail points and render each user's trail
    const clientsToRemove = [];
    this.allTrails.forEach((trailPoints, clientId) => {
      // Remove points that are too old or have faded completely
      const activePoints = trailPoints.filter(point => {
        const age = now - point.timestamp;
        if (age >= this.trailFadeTime) return false;
        
        // Also remove points that are too faded
        const fadeProgress = age / this.trailFadeTime;
        const alpha = 1 - fadeProgress;
        return alpha > this.minAlpha;
      });
      
      // Remove empty trails
      if (activePoints.length === 0) {
        clientsToRemove.push(clientId);
      } else {
        // Update trail with only active points
        this.allTrails.set(clientId, activePoints);
        
        // Draw smooth fading trail with glow (uses screen blend mode)
        this.drawSmoothTrail(activePoints, now);
      }
    });
    
    // Clean up empty trails
    clientsToRemove.forEach(clientId => {
      this.allTrails.delete(clientId);
    });
  }

  drawSmoothTrail(points, currentTime) {
    if (points.length === 0) return;
    
    const ctx = this.ctx;
    ctx.save();
    
    // Enable blending mode for smooth color mixing when trails cross
    ctx.globalCompositeOperation = 'screen'; // Screen blend for bright, glowing effect
    
    // Draw smooth connected lines with fading and glow
    for (let i = 0; i < points.length - 1; i++) {
      const point = points[i];
      const nextPoint = points[i + 1];
      
      // Calculate fade based on age (smooth fade curve)
      const age = currentTime - point.timestamp;
      const fadeProgress = Math.min(1, age / this.trailFadeTime);
      // Use ease-out curve for smoother fade
      const easedProgress = 1 - Math.pow(1 - fadeProgress, 2);
      const alpha = Math.max(0, 1 - easedProgress);
      
      // Skip if too faded
      if (alpha <= this.minAlpha) continue;
      
      // Get gradient colors for this point
      const gradientColors = this.useGradients ? this.getGradientColors(point.color) : null;
      
      // Draw multiple glow layers for soft glow effect
      for (let layer = this.glowLayers; layer >= 1; layer--) {
        const layerAlpha = alpha * (0.3 / layer); // Each layer is more transparent
        const layerWidth = (2 + (alpha * 3)) * (1 + layer * 0.3); // Wider for outer layers
        const glowBlur = this.baseGlowRadius * layer * alpha;
        
        // Create gradient for smooth color blending
        const gradient = ctx.createLinearGradient(
          point.x, point.y,
          nextPoint.x, nextPoint.y
        );
        
        // Use gradient colors if enabled, otherwise use base color
        let startColor, endColor;
        if (gradientColors) {
          // Blend between pastel and neon for vibrant effect
          const blendFactor = Math.sin(i / 5) * 0.5 + 0.5; // Oscillating blend
          startColor = this.blendColors(
            gradientColors.pastel,
            gradientColors.neon,
            blendFactor,
            layerAlpha
          );
          
          const nextAge = currentTime - nextPoint.timestamp;
          const nextFadeProgress = Math.min(1, nextAge / this.trailFadeTime);
          const nextEasedProgress = 1 - Math.pow(1 - nextFadeProgress, 2);
          const nextAlpha = Math.max(0, 1 - nextEasedProgress);
          const nextBlendFactor = Math.sin((i + 1) / 5) * 0.5 + 0.5;
          endColor = this.blendColors(
            gradientColors.pastel,
            gradientColors.neon,
            nextBlendFactor,
            nextAlpha * (0.3 / layer)
          );
        } else {
          startColor = this.hexToRgba(point.color, layerAlpha);
          const nextAge = currentTime - nextPoint.timestamp;
          const nextFadeProgress = Math.min(1, nextAge / this.trailFadeTime);
          const nextEasedProgress = 1 - Math.pow(1 - nextFadeProgress, 2);
          const endAlpha = Math.max(0, 1 - nextEasedProgress);
          endColor = this.hexToRgba(nextPoint.color || point.color, endAlpha * (0.3 / layer));
        }
        
        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);
        
        // Draw line segment with glow
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(nextPoint.x, nextPoint.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = layerWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = glowBlur;
        ctx.shadowColor = point.color;
        ctx.stroke();
      }
    }
    
    // Draw glowing dots at each point with soft radial glow
    points.forEach((point) => {
      const age = currentTime - point.timestamp;
      const fadeProgress = Math.min(1, age / this.trailFadeTime);
      // Use ease-out curve for smoother fade
      const easedProgress = 1 - Math.pow(1 - fadeProgress, 2);
      const alpha = Math.max(0, 1 - easedProgress);
      
      // Only draw if visible enough
      if (alpha > this.minAlpha) {
        const gradientColors = this.useGradients ? this.getGradientColors(point.color) : null;
        
        // Draw multiple glow layers for soft dot effect
        for (let layer = this.glowLayers; layer >= 1; layer--) {
          const layerAlpha = alpha * (0.4 / layer);
          const radius = (3 + (alpha * 4)) * (1 + layer * 0.4);
          const glowBlur = this.baseGlowRadius * layer * alpha * 0.8;
          
          // Create radial gradient for soft glow
          const radialGradient = ctx.createRadialGradient(
            point.x, point.y, 0,
            point.x, point.y, radius * 2
          );
          
          let centerColor, edgeColor;
          if (gradientColors) {
            centerColor = this.hexToRgba(gradientColors.neon, layerAlpha);
            edgeColor = this.hexToRgba(gradientColors.pastel, layerAlpha * 0.3);
          } else {
            centerColor = this.hexToRgba(point.color, layerAlpha);
            edgeColor = this.hexToRgba(point.color, layerAlpha * 0.3);
          }
          
          radialGradient.addColorStop(0, centerColor);
          radialGradient.addColorStop(0.5, this.hexToRgba(point.color, layerAlpha * 0.6));
          radialGradient.addColorStop(1, edgeColor);
          
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = radialGradient;
          ctx.shadowBlur = glowBlur;
          ctx.shadowColor = point.color;
          ctx.fill();
        }
      }
    });
    
    ctx.restore();
  }

  /**
   * Blend two colors smoothly
   */
  blendColors(color1, color2, factor, alpha) {
    // Parse RGB from color strings
    const rgb1 = this.parseRgb(color1);
    const rgb2 = this.parseRgb(color2);
    
    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Parse RGB from color string (handles both rgb() and hex)
   */
  parseRgb(color) {
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      return {
        r: parseInt(matches[0]),
        g: parseInt(matches[1]),
        b: parseInt(matches[2])
      };
    } else if (color.startsWith('#')) {
      return this.hexToRgb(color);
    }
    return { r: 255, g: 255, b: 255 };
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  renderCursors() {
    const now = Date.now();
    const cursorTimeout = 2000; // Remove cursors older than 2 seconds
    
    // Clear cursor canvas
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
    
    // Clean up stale cursors
    this.otherCursors.forEach((cursor, clientId) => {
      if (now - cursor.timestamp > cursorTimeout) {
        this.otherCursors.delete(clientId);
      }
    });
    
    // Draw all active cursors on the separate cursor canvas
    this.otherCursors.forEach((cursor) => {
      this.drawCursor(cursor.x, cursor.y, cursor.color);
    });
  }

  drawCursor(x, y, color) {
    // Save current context state
    this.cursorCtx.save();
    
    // Draw cursor circle
    this.cursorCtx.fillStyle = color;
    this.cursorCtx.beginPath();
    this.cursorCtx.arc(x, y, 8, 0, Math.PI * 2);
    this.cursorCtx.fill();
    
    // Add glow effect
    this.cursorCtx.shadowBlur = 20;
    this.cursorCtx.shadowColor = color;
    this.cursorCtx.fill();
    
    // Draw inner dot
    this.cursorCtx.fillStyle = 'white';
    this.cursorCtx.beginPath();
    this.cursorCtx.arc(x, y, 3, 0, Math.PI * 2);
    this.cursorCtx.fill();
    
    // Restore context state
    this.cursorCtx.restore();
  }

  /**
   * Connect to WebSocket server
   * Automatically uses wss:// for HTTPS and ws:// for HTTP
   * Handles connection, message receiving, errors, and reconnection
   */
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    // Create WebSocket connection
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to WebSocket server');
      this.updateStatus(true);
      
      // Start heartbeat to keep connection alive
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus(false);
    };

    this.ws.onclose = (event) => {
      console.log('Disconnected from WebSocket server', event.code, event.reason);
      this.updateStatus(false);
      this.stopHeartbeat();
      
      // Attempt to reconnect after 3 seconds (unless it was a normal closure)
      if (event.code !== 1000) {
        setTimeout(() => {
          console.log('Attempting to reconnect...');
          this.connect();
        }, 3000);
      }
    };
  }

  startHeartbeat() {
    // Send ping every 25 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'welcome':
        console.log(data.message);
        if (data.clientId) {
          this.clientId = data.clientId;
          console.log('Your client ID:', data.clientId);
        }
        this.updateClientCount(data.clientCount);
        break;
      
      case 'lightTrail':
        // Add trail point from another client
        this.drawTrail({
          trail: data.trail,
          color: data.color,
          clientId: data.clientId
        });
        break;
      
      case 'mousePosition':
        // Update cursor position for another client
        if (data.clientId && data.clientId !== this.clientId) {
          this.otherCursors.set(data.clientId, {
            x: data.x,
            y: data.y,
            color: data.color || '#ffffff',
            timestamp: data.timestamp || Date.now()
          });
        }
        break;
      
      case 'clear':
        // Clear canvas from server (another client cleared it)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.allTrails.clear();
        // Also clear other cursors
        this.otherCursors.clear();
        break;
      
      case 'clientJoined':
        this.updateClientCount(data.clientCount);
        break;
      
      case 'clientLeft':
        // Remove cursor and trail for disconnected client
        if (data.clientId) {
          this.otherCursors.delete(data.clientId);
          this.allTrails.delete(data.clientId);
        }
        this.updateClientCount(data.clientCount);
        break;
      
      case 'pong':
        // Heartbeat response
        break;
      
      case 'error':
        console.error('Server error:', data.message);
        break;
      
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  updateStatus(connected) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (!statusDot || !statusText) {
      console.warn('Status elements not found');
      return;
    }
    
    if (connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Disconnected';
    }
  }

  updateClientCount(count) {
    const clientCountEl = document.getElementById('clientCount');
    if (clientCountEl) {
      clientCountEl.textContent = count;
    } else {
      console.warn('Client count element not found');
    }
  }
}

// Initialize client when page loads
window.addEventListener('DOMContentLoaded', () => {
  new LightTrailsClient();
});

