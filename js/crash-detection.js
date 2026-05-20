const CrashDetection = {
  threshold: 25, // m/s² 
  enabled: true,
  lastAlert: 0,
  _motionListener: null,

  start() {
    this.enabled = Storage.getSettings().detectionOn;
    if (!this.enabled) return;
    if (!window.DeviceMotionEvent) {
      this._displayStatusText("No sensor hardware");
      return;
    }

    // Clean up old event listener bounds if running repeatedly
    if (this._motionListener) {
      window.removeEventListener('devicemotion', this._motionListener);
    }

    this._motionListener = (e) => this.handleMotion(e);
    window.addEventListener('devicemotion', this._motionListener);
  },

  handleMotion(e) {
    if (!this.enabled) return;

    // Use e.acceleration (linear acceleration without gravity baseline)
    // If unavailable, fall back to gravity vectors minus the earth baseline constants
    let a = e.acceleration;
    let mag = 0;

    if (a && a.x !== null) {
      mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
    } else {
      a = e.accelerationIncludingGravity;
      if (a && a.x !== null) {
        const totalForce = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
        mag = Math.max(0, totalForce - 9.8); // Offset 1G flat rest vector
      }
    }

    this._updateUI(mag);

    // Evaluate crash threshold
    if (mag > this.threshold && Date.now() - this.lastAlert > 10000) {
      this.lastAlert = Date.now();
      App.showSOS('auto');
    }
  },

  simulateSpike() {
    if (!this.enabled) return;
    
    // Animate a high-speed crash impact spike numbers onto the UI
    this._updateUI(34.2);
    
    setTimeout(() => {
      App.showSOS('auto');
      // Calm sensor back down after event triggers
      this._updateUI(0.0);
    }, 400);
  },

  setEnabled(val) {
    this.enabled = val;
    const s = Storage.getSettings();
    s.detectionOn = val;
    Storage.set('settings', s);
    if (!val && this._motionListener) {
      window.removeEventListener('devicemotion', this._motionListener);
    }
  },

  _updateUI(magnitude) {
    const el = document.getElementById('live-accel');
    if (el) {
      el.textContent = `${magnitude.toFixed(1)} m/s²`;
      // Dynamically highlight high readings to red during live demonstrations
      if (magnitude > 12) {
        el.style.color = 'var(--red)';
      } else {
        el.style.color = 'var(--green)';
      }
    }
  },

  _displayStatusText(text) {
    const container = document.getElementById('detection-status-text');
    if (container) container.textContent = text;
  }
};