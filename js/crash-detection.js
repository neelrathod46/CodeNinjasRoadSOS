const CrashDetection = {
  threshold: 25, // m/s² — adjustable in settings
  enabled: true,
  lastAlert: 0,

  start() {
    this.enabled = Storage.getSettings().detectionOn;
    if (!this.enabled) return;
    if (!window.DeviceMotionEvent) return;

    window.addEventListener('devicemotion', e => {
      if (!this.enabled) return;
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt(a.x**2 + a.y**2 + a.z**2);
      if (mag > this.threshold && Date.now() - this.lastAlert > 10000) {
        this.lastAlert = Date.now();
        App.showSOS('auto');
      }
    });
  },

  setEnabled(val) {
    this.enabled = val;
    const s = Storage.getSettings();
    s.detectionOn = val;
    Storage.set('settings', s);
  }
};
