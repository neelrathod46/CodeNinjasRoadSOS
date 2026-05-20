const CrashDetection = {
  threshold: 25, 
  enabled: true,
  lastAlert: 0,
  _motionListener: null,

  start() {
    const settings = Storage.getSettings();
    this.enabled = settings.detectionOn;
    this.threshold = Number(settings.sensitivity || 25);
    
    if (!this.enabled) return;
    if (!window.DeviceMotionEvent) return;

    if (this._motionListener) {
      window.removeEventListener('devicemotion', this._motionListener);
    }

    this._motionListener = (e) => this.handleMotion(e);
    window.addEventListener('devicemotion', this._motionListener);
  },

  handleMotion(e) {
    if (!this.enabled) return;

    let a = e.acceleration;
    let mag = 0;

    // Use pure user acceleration if available
    if (a && a.x !== null) {
      mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
    } else {
      // Fallback: Isolate static gravity (~9.8 m/s²) from total acceleration vector
      a = e.accelerationIncludingGravity;
      if (a && a.x !== null) {
        const totalForce = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
        mag = Math.max(0, totalForce - 9.8);
      }
    }

    this._updateUI(mag);

    if (mag > this.threshold && Date.now() - this.lastAlert > 10000) {
      this.lastAlert = Date.now();
      App.showSOS('auto');
    }
  },

  simulateSpike() {
    if (!this.enabled) return;
    this._updateUI(this.threshold + 10);
    setTimeout(() => {
      App.showSOS('auto');
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
      el.style.color = magnitude > 15 ? 'var(--red)' : 'var(--green)';
    }
  }
};