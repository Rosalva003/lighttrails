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
    console.log('LightTrailsClient constructor started');
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
    this.currentSize = 1;
    this.currentGlow = 1.2;
    this.cursorMode = 'halo';
    this.username = this.generateDefaultUsername();
    const storedUsername = this.loadStoredUsername();
    if (storedUsername) {
      this.username = storedUsername;
    }
    this.userSettings = new Map();
    this.settingsUpdateTimeout = null;
    this.trailPoints = [];
    this.clientId = null;
    
    console.log('Canvas size (initial):', this.canvas.width, this.canvas.height);

    this.joinOrbLayer = document.getElementById('joinOrbLayer');
    if (!this.joinOrbLayer) {
      this.joinOrbLayer = document.createElement('div');
      this.joinOrbLayer.className = 'join-orb-layer';
      this.joinOrbLayer.id = 'joinOrbLayer';
      document.body.appendChild(this.joinOrbLayer);
    }

    this.rippleLayer = document.getElementById('rippleLayer');
    if (!this.rippleLayer) {
      this.rippleLayer = document.createElement('div');
      this.rippleLayer.className = 'ripple-layer';
      this.rippleLayer.id = 'rippleLayer';
      document.body.appendChild(this.rippleLayer);
    }

    this.sparkleLayer = document.getElementById('sparkleLayer');
    if (!this.sparkleLayer) {
      this.sparkleLayer = document.createElement('div');
      this.sparkleLayer.className = 'sparkle-layer';
      this.sparkleLayer.id = 'sparkleLayer';
      document.body.appendChild(this.sparkleLayer);
    }

    this.shootingStarLayer = document.getElementById('shootingStarLayer');
    if (!this.shootingStarLayer) {
      this.shootingStarLayer = document.createElement('div');
      this.shootingStarLayer.className = 'shooting-star-layer';
      this.shootingStarLayer.id = 'shootingStarLayer';
      document.body.appendChild(this.shootingStarLayer);
    }

    this.usernameTagLayer = document.getElementById('usernameTagLayer');
    if (!this.usernameTagLayer) {
      this.usernameTagLayer = document.createElement('div');
      this.usernameTagLayer.className = 'username-tag-layer';
      this.usernameTagLayer.id = 'usernameTagLayer';
      document.body.appendChild(this.usernameTagLayer);
    }
    this.usernameTags = new Map();
    this.connectedStarsEl = document.getElementById('connectedStars');
    if (this.connectedStarsEl) {
      this.connectedStarsEl.textContent = 'Connecting stars...';
    } else {
      console.warn('Connected stars element not found');
    }

    this.lastTrailPoints = [];
    this.scheduleNextShootingStar();
    this.latestClientCount = 0;
    
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
    this.refreshUIFromSettings();
    
    // Start animation loop for rendering cursors and trails
    this.startAnimationLoop();
    
    // Connect to WebSocket server
    this.connect();
  }

  loadStoredUsername() {
    try {
      const stored = window.localStorage.getItem('lightTrailsUsername');
      if (stored && stored.trim()) {
        return stored.trim().slice(0, 18);
      }
    } catch (error) {
      console.warn('Unable to access stored username', error);
    }
    return null;
  }

  persistUsername(value) {
    try {
      if (value && value.trim()) {
        window.localStorage.setItem('lightTrailsUsername', value.trim().slice(0, 18));
      } else {
        window.localStorage.removeItem('lightTrailsUsername');
      }
    } catch (error) {
      console.warn('Unable to persist username', error);
    }
  }

  getCurrentSettings() {
    return {
      color: this.currentColor,
      size: this.currentSize,
      glow: this.currentGlow,
      cursorMode: this.cursorMode,
      username: this.username
    };
  }

  refreshUIFromSettings() {
    if (this.colorPicker) {
      this.colorPicker.value = this.currentColor;
    }
    if (this.sizeSlider) {
      this.sizeSlider.value = this.currentSize;
    }
    if (this.sizeValue) {
      this.sizeValue.textContent = this.currentSize.toFixed(1);
    }
    if (this.glowSlider) {
      this.glowSlider.value = this.currentGlow;
    }
    if (this.glowValue) {
      this.glowValue.textContent = this.currentGlow.toFixed(1);
    }
    if (this.cursorModeBtn && this.updateCursorButton) {
      this.updateCursorButton();
    }
    if (this.usernameInput) {
      this.usernameInput.value = this.username;
    }
  }

  queueSettingsUpdate() {
    if (this.settingsUpdateTimeout) {
      window.clearTimeout(this.settingsUpdateTimeout);
    }
    this.settingsUpdateTimeout = window.setTimeout(() => {
      this.sendSettingsUpdate();
    }, 120);
  }

  sendSettingsUpdate() {
    if (this.settingsUpdateTimeout) {
      window.clearTimeout(this.settingsUpdateTimeout);
      this.settingsUpdateTimeout = null;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.settingsUpdateTimeout = window.setTimeout(() => {
        this.sendSettingsUpdate();
      }, 320);
      return;
    }

    const settings = this.getCurrentSettings();
    if (this.clientId) {
      this.userSettings.set(this.clientId, settings);
    }

    this.ws.send(JSON.stringify({
      type: 'updateSettings',
      color: settings.color,
      size: settings.size,
      glow: settings.glow,
      cursorMode: settings.cursorMode,
      username: settings.username
    }));
  }

  applyLocalSettingsAck(settings = {}) {
    if (!settings) return;

    if (settings.color) {
      this.currentColor = settings.color;
    }
    if (typeof settings.size === 'number') {
      this.currentSize = this.clamp(settings.size, 0.5, 3);
    }
    if (typeof settings.glow === 'number') {
      this.currentGlow = this.clamp(settings.glow, 0.5, 3);
    }
    if (settings.cursorMode === 'star' || settings.cursorMode === 'halo') {
      this.cursorMode = settings.cursorMode;
    }
    if (typeof settings.username === 'string') {
      const trimmed = settings.username.trim();
      if (trimmed) {
        this.username = trimmed.slice(0, 18);
      }
    }

    if (this.clientId) {
      this.userSettings.set(this.clientId, this.getCurrentSettings());
    }
    this.persistUsername(this.username);
    this.refreshUIFromSettings();
  }

  applyRemoteSettings(clientId, settings = {}) {
    if (!clientId || clientId === this.clientId) return;

    const sanitized = {
      color: settings.color || '#ffffff',
      size: this.clamp(settings.size ?? 1, 0.5, 3),
      glow: this.clamp(settings.glow ?? 1, 0.5, 3),
      cursorMode: settings.cursorMode === 'star' ? 'star' : 'halo',
      username: settings.username && settings.username.trim()
        ? settings.username.trim().slice(0, 18)
        : this.getFallbackUsername(clientId)
    };

    this.userSettings.set(clientId, sanitized);

    const existingCursor = this.otherCursors.get(clientId) || {};
    const updatedCursor = {
      ...existingCursor,
      color: sanitized.color,
      size: sanitized.size,
      glow: sanitized.glow,
      cursorMode: sanitized.cursorMode,
      username: sanitized.username,
      x: existingCursor.x ?? window.innerWidth * 0.5,
      y: existingCursor.y ?? window.innerHeight * 0.5,
      timestamp: Date.now(),
      settings: sanitized
    };

    this.otherCursors.set(clientId, updatedCursor);
    this.updateUsernameTag(clientId, updatedCursor);
  }

  generateDefaultUsername() {
    const prefixes = [
      'Aurora',
      'Nebula',
      'Comet',
      'Nova',
      'Lyra',
      'Celeste',
      'Orion',
      'Halo',
      'Stellar',
      'Lumen'
    ];
    const suffix = Math.floor(100 + Math.random() * 900);
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}-${suffix}`;
  }

  getFallbackUsername(clientId) {
    if (!clientId) return 'Stellar';
    return `Star-${clientId.slice(-4).toUpperCase()}`;
  }

  updateUsernameTag(clientId, data = {}, isSelf = false) {
    if (!this.usernameTagLayer || !clientId || !data) return;

    let tagEntry = this.usernameTags.get(clientId);
    if (!tagEntry) {
      const tagEl = document.createElement('div');
      tagEl.className = 'username-tag';
      if (isSelf) tagEl.classList.add('self');

      const nameEl = document.createElement('span');
      nameEl.className = 'username-tag-text';
      tagEl.appendChild(nameEl);

      const auraEl = document.createElement('div');
      auraEl.className = 'username-tag-aura';
      tagEl.appendChild(auraEl);

      this.usernameTagLayer.appendChild(tagEl);
      tagEntry = { element: tagEl, label: nameEl, aura: auraEl, isSelf };
      this.usernameTags.set(clientId, tagEntry);
    }

    tagEntry.isSelf = isSelf;
    tagEntry.element.classList.toggle('self', isSelf);
    tagEntry.element.classList.toggle('remote', !isSelf);

    const username = data.username || this.getFallbackUsername(clientId);
    tagEntry.label.textContent = username;

    const palette = this.getShimmerPalette(data.color || '#ffffff', 0, Date.now());
    tagEntry.aura.style.background = `radial-gradient(circle at center, ${this.hexToRgba(palette.mid, 0.48)}, ${this.hexToRgba(palette.end, 0)})`;

    const offsetY = isSelf ? -78 : -86;
    tagEntry.element.style.left = `${data.x ?? window.innerWidth * 0.5}px`;
    tagEntry.element.style.top = `${(data.y ?? window.innerHeight * 0.5) + offsetY}px`;
    tagEntry.element.style.transform = 'translate(-50%, -50%)';
    tagEntry.lastUpdated = Date.now();
  }

  removeUsernameTag(clientId) {
    const entry = this.usernameTags.get(clientId);
    if (!entry) return;
    if (entry.element && entry.element.parentElement) {
      entry.element.parentElement.removeChild(entry.element);
    }
    this.usernameTags.delete(clientId);
  }

  cleanupUsernameTags(now) {
    const timeout = 3200;
    this.usernameTags.forEach((entry, clientId) => {
      if (!entry.lastUpdated) return;
      if (entry.isSelf) {
        if (!this.lastMousePosition || now - entry.lastUpdated > timeout) {
          this.removeUsernameTag(clientId);
        }
        return;
      }
      if (now - entry.lastUpdated > timeout) {
        this.removeUsernameTag(clientId);
        this.otherCursors.delete(clientId);
        this.userSettings.delete(clientId);
      }
    });
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
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) {
      this.usernameInput = usernameInput;
      usernameInput.value = this.username;
      usernameInput.addEventListener('input', (e) => {
        const rawValue = e.target.value.slice(0, 18);
        this.username = rawValue.trim() ? rawValue : this.generateDefaultUsername();
        usernameInput.value = this.username;
        this.persistUsername(this.username);
        this.queueSettingsUpdate();
      });
    } else {
      console.warn('Username input element not found');
    }

    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
      this.colorPicker = colorPicker;
      colorPicker.value = this.currentColor;
      colorPicker.addEventListener('input', (e) => {
        this.currentColor = e.target.value;
        this.queueSettingsUpdate();
      });
    } else {
      console.warn('Color picker element not found');
    }

    const randomColorBtn = document.getElementById('randomColorBtn');
    if (randomColorBtn) {
      this.randomColorBtn = randomColorBtn;
      randomColorBtn.addEventListener('click', () => {
        this.currentColor = this.getRandomColor();
        if (this.colorPicker) this.colorPicker.value = this.currentColor;
        this.queueSettingsUpdate();
      });
    } else {
      console.warn('Random color button element not found');
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      this.clearBtn = clearBtn;
      clearBtn.addEventListener('click', () => {
        this.clearCanvas(true);
      });
    } else {
      console.warn('Clear button element not found');
    }

    const sizeSlider = document.getElementById('sizeSlider');
    const sizeValue = document.getElementById('sizeValue');
    if (sizeSlider) {
      this.sizeSlider = sizeSlider;
      this.sizeValue = sizeValue;
      sizeSlider.value = this.currentSize;
      if (sizeValue) sizeValue.textContent = this.currentSize.toFixed(1);
      sizeSlider.addEventListener('input', (e) => {
        this.currentSize = parseFloat(e.target.value);
        if (this.sizeValue) this.sizeValue.textContent = this.currentSize.toFixed(1);
        this.queueSettingsUpdate();
      });
    } else {
      console.warn('Size slider not found');
    }

    const glowSlider = document.getElementById('glowSlider');
    const glowValue = document.getElementById('glowValue');
    if (glowSlider) {
      this.glowSlider = glowSlider;
      this.glowValue = glowValue;
      glowSlider.value = this.currentGlow;
      if (glowValue) glowValue.textContent = this.currentGlow.toFixed(1);
      glowSlider.addEventListener('input', (e) => {
        this.currentGlow = parseFloat(e.target.value);
        if (this.glowValue) this.glowValue.textContent = this.currentGlow.toFixed(1);
        this.queueSettingsUpdate();
      });
    } else {
      console.warn('Glow slider not found');
    }

    const cursorModeBtn = document.getElementById('cursorModeBtn');
    if (cursorModeBtn) {
      this.cursorModeBtn = cursorModeBtn;
      const updateCursorButton = () => {
        cursorModeBtn.textContent = `Cursor: ${this.cursorMode === 'halo' ? 'Halo' : 'Star'}`;
      };
      this.updateCursorButton = updateCursorButton;
      updateCursorButton();
      cursorModeBtn.addEventListener('click', () => {
        this.cursorMode = this.cursorMode === 'halo' ? 'star' : 'halo';
        if (this.updateCursorButton) this.updateCursorButton();
        this.queueSettingsUpdate();
      });
    } else {
      console.warn('Cursor mode button not found');
    }

    this.refreshUIFromSettings();
    this.setupDrawingEvents();
  }

  setupDrawingEvents() {
    if (!this.canvas) {
      console.error('Canvas not found, cannot setup drawing events');
      return;
    }
    
    console.log('Setting up drawing events on canvas'); // Debug log
    
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      console.log('mousedown event', e); // Debug log
      this.startDrawing(e);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      this.draw(e);
      this.trackMousePosition(e);
    });
    this.canvas.addEventListener('mouseup', () => {
      console.log('mouseup event'); // Debug log
      this.stopDrawing();
    });
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

  rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h;
    let s;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
        default:
          h = 0;
      }

      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  hexToHsl(hex) {
    const { r, g, b } = this.hexToRgb(hex);
    return this.rgbToHsl(r, g, b);
  }

  hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    if (s === 0) {
      const val = Math.round(l * 255);
      return { r: val, g: val, b: val };
    }

    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = hue2rgb(p, q, h / 360 + 1 / 3);
    const g = hue2rgb(p, q, h / 360);
    const b = hue2rgb(p, q, h / 360 - 1 / 3);

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  hslToHex(h, s, l) {
    const { r, g, b } = this.hslToRgb(h, s, l);
    return `#${this.componentToHex(r)}${this.componentToHex(g)}${this.componentToHex(b)}`;
  }

  componentToHex(value) {
    const hex = value.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  }

  clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.min(max, Math.max(min, num));
  }

  getShimmerPalette(baseColor, segmentIndex, currentTime) {
    const baseHsl = this.hexToHsl(baseColor);
    const timeFactor = currentTime / 1000;
    const wavePrimary = Math.sin(segmentIndex * 0.45 + timeFactor * 0.85);
    const waveSecondary = Math.cos(segmentIndex * 0.28 + timeFactor * 0.65);

    const startHue = (baseHsl.h + wavePrimary * 24 + 360) % 360;
    const midHue = (startHue + 20 + waveSecondary * 10 + 360) % 360;
    const endHue = (startHue - 26 + wavePrimary * 12 + 360) % 360;

    const startSat = Math.min(88, baseHsl.s + 14);
    const midSat = Math.min(92, baseHsl.s + 18);
    const endSat = Math.max(60, baseHsl.s - 8);

    const startLight = Math.min(84, baseHsl.l + 16);
    const midLight = Math.min(88, baseHsl.l + 20);
    const endLight = Math.max(55, baseHsl.l - 4);

    return {
      start: this.hslToHex(startHue, startSat, startLight),
      mid: this.hslToHex(midHue, midSat, midLight),
      end: this.hslToHex(endHue, endSat, endLight)
    };
  }

  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  startDrawing(e) {
    console.log('startDrawing called', e); // Debug log
    this.isDrawing = true;
    const coords = this.getCanvasCoordinates(e);
    console.log('Canvas coordinates:', coords); // Debug log
    this.createRipple(e);
    const timestamp = Date.now();
    const startPoint = {
      x: coords.x,
      y: coords.y,
      color: this.currentColor,
      size: this.currentSize,
      glow: this.currentGlow,
      timestamp
    };
    this.trailPoints = [startPoint];
    
    // Initialize trail for this client if not exists (only if clientId is set)
    if (this.clientId) {
      if (!this.allTrails.has(this.clientId)) {
        this.allTrails.set(this.clientId, []);
      }
      
      // Add starting point to trail
      this.allTrails.get(this.clientId).push({ ...startPoint });
      this.lastTrailPoints.push({
        clientId: this.clientId,
        point: { ...startPoint },
        timestamp
      });
    } else {
      // Allow drawing even if clientId not set yet (will be set on welcome message)
      const tempId = 'temp_' + Date.now();
      if (!this.allTrails.has(tempId)) {
        this.allTrails.set(tempId, []);
      }
      this.allTrails.get(tempId).push({ ...startPoint });
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
    
    const point = {
      x: coords.x,
      y: coords.y,
      color: this.currentColor,
      size: this.currentSize,
      glow: this.currentGlow,
      timestamp: now
    };
    this.trailPoints.push(point);
    
    // Add to local trail storage (only if clientId is set)
    if (this.clientId) {
      if (!this.allTrails.has(this.clientId)) {
        this.allTrails.set(this.clientId, []);
      }
      
      this.allTrails.get(this.clientId).push({ ...point });
      this.lastTrailPoints.push({
        clientId: this.clientId,
        point: { ...point },
        timestamp: now
      });
    }
    
    // Send trail segment to server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const settings = this.getCurrentSettings();
      this.ws.send(JSON.stringify({
        type: 'lightTrail',
        trail: {
          x: coords.x,
          y: coords.y,
          size: settings.size,
          glow: settings.glow
        },
        color: settings.color,
        size: settings.size,
        glow: settings.glow,
        cursorMode: settings.cursorMode,
        username: settings.username
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
      const settings = this.getCurrentSettings();
      this.ws.send(JSON.stringify({
        type: 'mousePosition',
        x: coords.x,
        y: coords.y,
        color: settings.color,
        size: settings.size,
        glow: settings.glow,
        cursorMode: settings.cursorMode,
        username: settings.username
      }));
    }
  }

  drawTrail(trail, color) {
    // Add incoming trail point to storage
    if (!this.allTrails.has(trail.clientId)) {
      this.allTrails.set(trail.clientId, []);
    }
    
    const trailArray = this.allTrails.get(trail.clientId);
    const incoming = trail.trail || trail;
    const point = {
      x: incoming.x,
      y: incoming.y,
      color: trail.color || color,
      size: this.clamp(incoming.size ?? trail.size ?? 1, 0.5, 3),
      glow: this.clamp(incoming.glow ?? trail.glow ?? 1, 0.5, 3),
      timestamp: Date.now()
    };
    
    trailArray.push(point);
    
    this.lastTrailPoints.push({
      clientId: trail.clientId,
      point,
      timestamp: point.timestamp
    });
    
    if (trailArray.length > 500) {
      trailArray.shift();
    }

    if (trail.clientId && trail.clientId !== this.clientId) {
      const previous = this.userSettings.get(trail.clientId) || {};
      const sanitizedUsername = trail.username && typeof trail.username === 'string'
        ? trail.username.trim().slice(0, 18)
        : '';

      const mergedSettings = {
        color: trail.color || previous.color || point.color,
        size: this.clamp((trail.size ?? previous.size ?? point.size ?? 1), 0.5, 3),
        glow: this.clamp((trail.glow ?? previous.glow ?? point.glow ?? 1), 0.5, 3),
        cursorMode: trail.cursorMode === 'star'
          ? 'star'
          : (previous.cursorMode || 'halo'),
        username: sanitizedUsername || previous.username || this.getFallbackUsername(trail.clientId)
      };

      this.userSettings.set(trail.clientId, mergedSettings);

      const updatedCursor = {
        x: point.x,
        y: point.y,
        color: mergedSettings.color,
        size: mergedSettings.size,
        glow: mergedSettings.glow,
        cursorMode: mergedSettings.cursorMode,
        username: mergedSettings.username,
        timestamp: Date.now(),
        settings: mergedSettings
      };
      this.otherCursors.set(trail.clientId, updatedCursor);
      this.updateUsernameTag(trail.clientId, updatedCursor);
    }
  }

  clearCanvas(sendToServer = true) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.allTrails.clear();
    this.lastTrailPoints = [];
    
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
        
        const lastSegment = this.drawSmoothTrail(activePoints, now, clientId);
        if (lastSegment) {
          this.checkForCollisions(clientId, lastSegment);
        }
      }
    });
    
    // Clean up empty trails
    clientsToRemove.forEach(clientId => {
      this.allTrails.delete(clientId);
    });
  }

  drawSmoothTrail(points, currentTime, clientId) {
    if (points.length === 0) return;
    
    const ctx = this.ctx;
    ctx.save();
    
    // Enable blending mode for smooth color mixing when trails cross
    ctx.globalCompositeOperation = 'screen'; // Screen blend for bright, glowing effect
    
    // Draw smooth connected lines with fading and glow
    let lastSegment = null;
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
      const sizeA = this.clamp(point.size ?? 1, 0.5, 3);
      const sizeB = this.clamp(nextPoint.size ?? sizeA, 0.5, 3);
      const glowA = this.clamp(point.glow ?? 1, 0.5, 3);
      const glowB = this.clamp(nextPoint.glow ?? glowA, 0.5, 3);
      const sizeAverage = (sizeA + sizeB) / 2;
      const glowAverage = (glowA + glowB) / 2;
      const adjustedAlpha = alpha * Math.min(1.25, glowAverage);
      
      // Draw multiple glow layers for soft glow effect
      for (let layer = this.glowLayers; layer >= 1; layer--) {
        const layerAlpha = adjustedAlpha * (0.3 / layer);
        const layerWidth = (2 + (alpha * 3)) * (1 + layer * 0.28) * (0.8 + sizeAverage * 0.55);
        const glowBlur = this.baseGlowRadius * layer * alpha * (0.6 + glowAverage * 0.6);
        
        // Create gradient for smooth color blending
        const gradient = ctx.createLinearGradient(
          point.x, point.y,
          nextPoint.x, nextPoint.y
        );
        
        // Use gradient colors if enabled, otherwise use base color
        const shimmerPalette = this.getShimmerPalette(point.color, i, currentTime);
        let startColor, midColor, endColor;
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
          midColor = this.hexToRgba(
            shimmerPalette.mid,
            Math.min(1, layerAlpha * 1.15)
          );
          endColor = this.blendColors(
            gradientColors.pastel,
            gradientColors.neon,
            nextBlendFactor,
            nextAlpha * (0.3 / layer)
          );
        } else {
          startColor = this.hexToRgba(shimmerPalette.start, layerAlpha);
          midColor = this.hexToRgba(
            shimmerPalette.mid,
            Math.min(1, layerAlpha * 1.1)
          );
          const nextAge = currentTime - nextPoint.timestamp;
          const nextFadeProgress = Math.min(1, nextAge / this.trailFadeTime);
          const nextEasedProgress = 1 - Math.pow(1 - nextFadeProgress, 2);
          const endAlpha = Math.max(0, 1 - nextEasedProgress);
          const nextPalette = this.getShimmerPalette(nextPoint.color || point.color, i + 1, currentTime);
          endColor = this.hexToRgba(nextPalette.end, endAlpha * (0.3 / layer));
        }
        
        gradient.addColorStop(0, startColor);
        if (midColor) {
          gradient.addColorStop(0.5, midColor);
        }
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
        ctx.shadowColor = this.hexToRgba(shimmerPalette.mid, Math.min(0.85, layerAlpha * glowAverage * 1.6));
        ctx.stroke();
      }
    }
    
    // Draw glowing dots at each point with soft radial glow
    points.forEach((point, index) => {
      const age = currentTime - point.timestamp;
      const fadeProgress = Math.min(1, age / this.trailFadeTime);
      // Use ease-out curve for smoother fade
      const easedProgress = 1 - Math.pow(1 - fadeProgress, 2);
      const alpha = Math.max(0, 1 - easedProgress);
      
      // Only draw if visible enough
      if (alpha > this.minAlpha) {
        const shimmerPalette = this.getShimmerPalette(point.color, index, currentTime);
        const gradientColors = this.useGradients ? this.getGradientColors(shimmerPalette.mid) : null;
        const sizeFactor = this.clamp(point.size ?? 1, 0.5, 3);
        const glowFactor = this.clamp(point.glow ?? 1, 0.5, 3);
        const dynamicAlpha = alpha * Math.min(1.2, glowFactor);
        
        // Draw multiple glow layers for soft dot effect
        for (let layer = this.glowLayers; layer >= 1; layer--) {
          const layerAlpha = dynamicAlpha * (0.4 / layer);
          const radius = (3 + (alpha * 4)) * (0.85 + sizeFactor * 0.55) * (1 + layer * 0.32);
          const glowBlur = this.baseGlowRadius * layer * alpha * 0.6 * (0.8 + glowFactor * 0.5);
          
          // Create radial gradient for soft glow
          const radialGradient = ctx.createRadialGradient(
            point.x, point.y, 0,
            point.x, point.y, radius * 2
          );
          
          let centerColor, midColor, edgeColor;
          if (gradientColors) {
            centerColor = this.hexToRgba(shimmerPalette.mid, layerAlpha * 1.1);
            midColor = this.hexToRgba(shimmerPalette.start, layerAlpha * 0.8);
            edgeColor = this.hexToRgba(shimmerPalette.end, layerAlpha * 0.35);
          } else {
            centerColor = this.hexToRgba(shimmerPalette.mid, layerAlpha * 1.05);
            midColor = this.hexToRgba(shimmerPalette.start, layerAlpha * 0.75);
            edgeColor = this.hexToRgba(shimmerPalette.end, layerAlpha * 0.32);
          }
          
          radialGradient.addColorStop(0, centerColor);
          radialGradient.addColorStop(0.45, midColor);
          radialGradient.addColorStop(0.75, this.hexToRgba(shimmerPalette.mid, layerAlpha * 0.45));
          radialGradient.addColorStop(1, edgeColor);
          
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = radialGradient;
          ctx.shadowBlur = glowBlur;
          ctx.shadowColor = this.hexToRgba(shimmerPalette.mid, Math.min(0.8, layerAlpha * glowFactor * 1.5));
          ctx.fill();
        }
      }
    });
    
    ctx.restore();

    if (points.length > 1) {
      const lastPoint = points[points.length - 2];
      const lastNext = points[points.length - 1];
      lastSegment = {
        clientId,
        x1: lastPoint.x,
        y1: lastPoint.y,
        x2: lastNext.x,
        y2: lastNext.y,
        timestamp: currentTime,
        palette: this.getShimmerPalette(lastNext.color || lastPoint.color, points.length - 2, currentTime)
      };
    }

    return lastSegment;
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
    const cursorTimeout = 2200; // Remove cursors older than ~2s
    
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
    
    const staleClients = [];
    this.otherCursors.forEach((cursor, clientId) => {
      if (now - (cursor.timestamp || 0) > cursorTimeout) {
        staleClients.push(clientId);
        return;
      }

      const settings = cursor.settings || this.userSettings.get(clientId) || {};
      const color = cursor.color || settings.color || '#ffffff';
      const size = this.clamp(settings.size ?? cursor.size ?? 1, 0.5, 3);
      const glow = this.clamp(settings.glow ?? cursor.glow ?? 1, 0.5, 3);
      const cursorMode = settings.cursorMode || cursor.cursorMode || 'halo';
      const username = settings.username || cursor.username || this.getFallbackUsername(clientId);

      this.drawCursor({
        x: cursor.x,
        y: cursor.y,
        color,
        size,
        glow,
        cursorMode
      });

      this.updateUsernameTag(clientId, {
        x: cursor.x,
        y: cursor.y,
        color,
        size,
        glow,
        cursorMode,
        username
      });
    });

    staleClients.forEach((clientId) => {
      this.otherCursors.delete(clientId);
      this.removeUsernameTag(clientId);
      this.userSettings.delete(clientId);
    });

    if (this.clientId && this.lastMousePosition) {
      this.updateUsernameTag(this.clientId, {
        x: this.lastMousePosition.x,
        y: this.lastMousePosition.y,
        color: this.currentColor,
        size: this.currentSize,
        glow: this.currentGlow,
        cursorMode: this.cursorMode,
        username: this.username
      }, true);
    }

    this.cleanupUsernameTags(now);
  }

  drawCursor({ x, y, color, size = 1, glow = 1, cursorMode = 'halo' }) {
    if (cursorMode === 'star') {
      this.drawStarCursor(x, y, color, size, glow);
    } else {
      this.drawHaloCursor(x, y, color, size, glow);
    }
  }

  drawHaloCursor(x, y, color, size = 1, glow = 1) {
    const ctx = this.cursorCtx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const currentTime = Date.now();
    const palette = this.getShimmerPalette(color, 0, currentTime);
    const glowFactor = Math.min(1.6, glow);
    const sizeScale = 0.8 + (size - 1) * 0.35;

    const rings = [
      { radius: 42 * sizeScale, color: palette.start, alpha: 0.12 * glowFactor, width: 12 * sizeScale, blur: 32 * glowFactor },
      { radius: 30 * sizeScale, color: palette.mid, alpha: 0.18 * glowFactor, width: 9 * sizeScale, blur: 24 * glowFactor },
      { radius: 22 * sizeScale, color: palette.end, alpha: 0.24 * glowFactor, width: 6 * sizeScale, blur: 18 * glowFactor }
    ];

    rings.forEach((ring) => {
      ctx.beginPath();
      ctx.strokeStyle = this.hexToRgba(ring.color, ring.alpha);
      ctx.lineWidth = ring.width;
      ctx.shadowBlur = ring.blur;
      ctx.shadowColor = this.hexToRgba(ring.color, ring.alpha * 1.8);
      ctx.arc(x, y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    const innerRadius = 16 * sizeScale;
    const innerGradient = ctx.createRadialGradient(x, y, 0, x, y, innerRadius);
    innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    innerGradient.addColorStop(0.4, this.hexToRgba(palette.mid, 0.62));
    innerGradient.addColorStop(0.75, this.hexToRgba(color, 0.4));
    innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = innerGradient;
    ctx.shadowBlur = 16 * glowFactor;
    ctx.shadowColor = this.hexToRgba(color, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
    ctx.arc(x, y, 4.2 * sizeScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawStarCursor(x, y, color, size = 1, glow = 1) {
    const ctx = this.cursorCtx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);

    const currentTime = Date.now();
    const palette = this.getShimmerPalette(color, 0, currentTime);
    const rotation = (currentTime / 900) % (Math.PI * 2);
    ctx.rotate(rotation);

    const scale = 0.9 + (size - 1) * 0.35;
    const outerRadius = 18 * scale;
    const innerRadius = outerRadius * 0.48;
    const spikes = 5;
    const glowFactor = Math.min(1.6, glow);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
    gradient.addColorStop(0, this.hexToRgba(palette.mid, 0.95));
    gradient.addColorStop(0.55, this.hexToRgba(palette.start, 0.6));
    gradient.addColorStop(1, this.hexToRgba(palette.end, 0));

    ctx.beginPath();
    for (let i = 0; i < spikes; i++) {
      const outerAngle = (i * 2 * Math.PI) / spikes;
      const innerAngle = outerAngle + Math.PI / spikes;
      ctx.lineTo(Math.cos(outerAngle) * outerRadius, Math.sin(outerAngle) * outerRadius);
      ctx.lineTo(Math.cos(innerAngle) * innerRadius, Math.sin(innerAngle) * innerRadius);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 24 * glowFactor;
    ctx.shadowColor = this.hexToRgba(palette.mid, 0.78);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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
    console.log('Connecting to WebSocket server at', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to WebSocket server');
      this.updateStatus(true);
      
      // Start heartbeat to keep connection alive
      this.startHeartbeat();
      this.sendSettingsUpdate();
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

  createJoinOrb({ isSelf = false, clientId = null } = {}) {
    if (!this.joinOrbLayer) {
      console.warn('Join orb layer not found');
      return;
    }

    const orb = document.createElement('div');
    orb.className = `join-orb ${isSelf ? 'self' : 'other'}`;
    if (clientId) {
      orb.dataset.clientId = clientId;
    }

    // Slight random rotation offset for variety
    this.joinOrbLayer.appendChild(orb);

    const handleAnimationEnd = () => {
      orb.remove();
    };

    orb.addEventListener('animationend', handleAnimationEnd, { once: true });
  }

  createRipple(event) {
    if (!this.rippleLayer) return;

    const coords = this.getClientCoordinates(event);
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = `${coords.x}px`;
    ripple.style.top = `${coords.y}px`;
    ripple.style.setProperty('--ripple-scale', (0.75 + this.currentSize * 0.45).toFixed(2));

    this.rippleLayer.appendChild(ripple);

    ripple.addEventListener('animationend', () => {
      ripple.remove();
    }, { once: true });
  }

  scheduleNextShootingStar() {
    const minDelay = 6500;
    const maxDelay = 14500;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    this.shootingStarTimeout = window.setTimeout(() => {
      this.createShootingStar();
      this.scheduleNextShootingStar();
    }, delay);
  }

  createShootingStar(options = {}) {
    if (!this.shootingStarLayer) return;

    const now = Date.now();
    const baseColor = options.baseColor || this.getRandomColor();
    const palette = options.palette || this.getShimmerPalette(baseColor, 0, now);

    const direction = options.direction || 'leftToRight';

    const startY = options.startY !== undefined
      ? options.startY
      : window.innerHeight * (0.1 + Math.random() * 0.7);

    let startX;
    let travelX;
    if (direction === 'rightToLeft') {
      startX = window.innerWidth + 200 + Math.random() * 160;
      travelX = -(window.innerWidth + 400 + Math.random() * 120);
    } else {
      startX = -200 - Math.random() * 160;
      travelX = window.innerWidth + 400 + Math.random() * 120;
    }

    const travelY = options.travelY !== undefined
      ? options.travelY
      : (Math.random() * 0.4 - 0.2) * window.innerHeight * 0.4;

    const angle = Math.atan2(travelY, travelX) * (180 / Math.PI);

    const star = document.createElement('div');
    star.className = 'shooting-star';
    star.style.left = `${startX}px`;
    star.style.top = `${startY}px`;
    star.style.setProperty('--startX', `${startX}px`);
    star.style.setProperty('--startY', `${startY}px`);
    star.style.setProperty('--travelX', `${travelX}px`);
    star.style.setProperty('--travelY', `${travelY}px`);
    star.style.setProperty('--angle', `${angle}deg`);
    if (options.duration) {
      star.style.animationDuration = `${options.duration}s`;
    }
    const gradientDirection = direction === 'rightToLeft' ? 270 : 90;
    star.style.background = `linear-gradient(${gradientDirection}deg, rgba(255,255,255,0) 0%, ${this.hexToRgba(palette.start, 0.0)} 10%, ${this.hexToRgba(palette.mid, 0.8)} 40%, ${this.hexToRgba(palette.end, 0.65)} 70%, rgba(255,255,255,0) 100%)`;

    this.shootingStarLayer.appendChild(star);

    star.addEventListener('animationend', () => {
      star.remove();
    }, { once: true });
  }

  startMeteorShower(eventData = {}) {
    const streakCount = eventData.streakCount ?? 12;
    const direction = eventData.direction ?? (Math.random() > 0.5 ? 'leftToRight' : 'rightToLeft');
    const duration = eventData.duration ?? 2.6;
    const baseColor = eventData.baseColor || this.getRandomColor();
    const spread = eventData.spread ?? 0.5;

    for (let i = 0; i < streakCount; i++) {
      const delay = i * 130 + Math.random() * 120;
      window.setTimeout(() => {
        const startY = window.innerHeight * (0.15 + Math.random() * 0.7);
        const travelY = (Math.random() * spread - spread / 2) * window.innerHeight * 0.5;
        this.createShootingStar({
          direction,
          startY,
          travelY,
          duration,
          palette: this.getShimmerPalette(baseColor, i, Date.now() + delay)
        });
      }, delay);
    }
  }

  checkForCollisions(clientId, segment) {
    const now = Date.now();
    const recentWindow = 120;

    this.lastTrailPoints = this.lastTrailPoints.filter(entry => now - entry.timestamp < recentWindow);

    const primaryPoints = [
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 }
    ];

    this.lastTrailPoints.forEach(entry => {
      if (entry.clientId === clientId) return;
      if (!entry.point) return;

      const { x, y } = entry.point;
      const distance = primaryPoints.reduce((minDistance, basePoint) => {
        const dx = basePoint.x - x;
        const dy = basePoint.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.min(minDistance, dist);
      }, Infinity);

      if (distance < 16) {
        this.createSparkle({
          x,
          y,
          paletteA: segment.palette,
          paletteB: this.getShimmerPalette(entry.point.color, 0, now)
        });
      }
    });
  }

  createSparkle({ x, y, paletteA, paletteB }) {
    if (!this.sparkleLayer) return;

    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle';
    sparkle.style.left = `${x}px`;
    sparkle.style.top = `${y}px`;

    const petalOne = document.createElement('div');
    petalOne.className = 'sparkle-petal';
    petalOne.style.background = `radial-gradient(circle, ${this.hexToRgba(paletteA.mid, 0.55)}, rgba(255, 255, 255, 0))`;

    const petalTwo = document.createElement('div');
    petalTwo.className = 'sparkle-petal';
    petalTwo.style.background = `radial-gradient(circle, ${this.hexToRgba(paletteB.mid, 0.55)}, rgba(255, 255, 255, 0))`;

    sparkle.appendChild(petalOne);
    sparkle.appendChild(petalTwo);

    this.sparkleLayer.appendChild(sparkle);

    sparkle.addEventListener('animationend', () => {
      sparkle.remove();
    }, { once: true });
  }

  getClientCoordinates(event) {
    if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      return { x: event.clientX, y: event.clientY };
    }

    if (event && event.touches && event.touches[0]) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    }

    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'welcome':
        console.log(data.message);
        if (data.clientId) {
          this.clientId = data.clientId;
          console.log('Your client ID:', data.clientId);
          this.userSettings.set(this.clientId, this.getCurrentSettings());
        }
        this.updateClientCount(data.clientCount);
        this.createJoinOrb({ isSelf: true, clientId: data.clientId });
        if (data.metadata && data.metadata.settings) {
          this.applyLocalSettingsAck(data.metadata.settings);
        }
        if (Array.isArray(data.allSettings)) {
          data.allSettings.forEach((entry) => {
            if (entry && entry.clientId && entry.settings) {
              this.applyRemoteSettings(entry.clientId, entry.settings);
            }
          });
        }
        this.sendSettingsUpdate();
        break;
      
      case 'lightTrail':
        // Add trail point from another client
        this.drawTrail({
          trail: data.trail,
          color: data.color,
          clientId: data.clientId,
          size: data.size,
          glow: data.glow,
          cursorMode: data.cursorMode,
          username: data.username
        });
        break;
      
      case 'mousePosition':
        // Update cursor position for another client
        if (data.clientId && data.clientId !== this.clientId) {
          const cursorEntry = {
            x: data.x,
            y: data.y,
            color: data.color || '#ffffff',
            size: this.clamp(data.size ?? 1, 0.5, 3),
            glow: this.clamp(data.glow ?? 1, 0.5, 3),
            cursorMode: data.cursorMode === 'star' ? 'star' : 'halo',
            username: data.username && data.username.trim()
              ? data.username.trim().slice(0, 18)
              : this.getFallbackUsername(data.clientId),
            timestamp: data.timestamp || Date.now(),
            settings: {
              color: data.color || '#ffffff',
              size: this.clamp(data.size ?? 1, 0.5, 3),
              glow: this.clamp(data.glow ?? 1, 0.5, 3),
              cursorMode: data.cursorMode === 'star' ? 'star' : 'halo',
              username: data.username && data.username.trim()
                ? data.username.trim().slice(0, 18)
                : this.getFallbackUsername(data.clientId)
            }
          };
          this.otherCursors.set(data.clientId, cursorEntry);
          this.userSettings.set(data.clientId, cursorEntry.settings);
          this.updateUsernameTag(data.clientId, {
            x: data.x,
            y: data.y,
            color: cursorEntry.color,
            size: cursorEntry.size,
            glow: cursorEntry.glow,
            cursorMode: cursorEntry.cursorMode,
            username: cursorEntry.username
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
        this.createJoinOrb({ isSelf: false, clientId: data.clientId });
        if (data.clientId && data.clientId !== this.clientId && data.metadata?.settings) {
          this.applyRemoteSettings(data.clientId, data.metadata.settings);
        }
        break;
      
      case 'userSettings':
        if (data.clientId === this.clientId) {
          this.applyLocalSettingsAck(data.settings);
        } else {
          this.applyRemoteSettings(data.clientId, data.settings);
        }
        break;

      case 'settingsAck':
        this.applyLocalSettingsAck(data.settings);
        break;

      case 'clientLeft':
        // Remove cursor and trail for disconnected client
        if (data.clientId) {
          this.otherCursors.delete(data.clientId);
          this.allTrails.delete(data.clientId);
          this.userSettings.delete(data.clientId);
          this.removeUsernameTag(data.clientId);
        }
        this.updateClientCount(data.clientCount);
        break;
      
      case 'pong':
        // Heartbeat response
        break;
      
      case 'error':
        console.error('Server error:', data.message);
        break;
      
      case 'meteorShower':
        this.startMeteorShower(data);
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
      if (this.connectedStarsEl) {
        const count = Math.max(1, this.latestClientCount || 1);
        this.connectedStarsEl.textContent = `${count} connected ${count === 1 ? 'star' : 'stars'}`;
      }
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Disconnected';
      if (this.connectedStarsEl) {
        this.connectedStarsEl.textContent = 'Reaching for stars...';
      }
    }
  }

  updateClientCount(count) {
    this.latestClientCount = count;
    if (!this.connectedStarsEl) {
      return;
    }
    if (typeof count !== 'number' || count < 0) {
      this.connectedStarsEl.textContent = 'Stellar network awaiting...';
      return;
    }
    if (count === 0) {
      this.connectedStarsEl.textContent = 'Awaiting starlight...';
      return;
    }
    this.connectedStarsEl.textContent = `${count} connected ${count === 1 ? 'star' : 'stars'}`;
  }
}

// Initialize client when page loads
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired - initializing LightTrailsClient');
  window.lightTrailsClient = new LightTrailsClient();
  if (window.lightTrailsClient && window.lightTrailsClient.canvas) {
    console.log('LightTrailsClient initialized successfully');
  } else {
    console.error('LightTrailsClient failed to initialize');
  }
  setTimeout(() => {
    document.body.classList.add('intro-ready');
  }, 80);
});

