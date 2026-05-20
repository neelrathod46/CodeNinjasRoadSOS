const Geo = {
  current: null,

  start() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.current = { lat, lng };
        Storage.setLocation(lat, lng, null);
        this._updateUI(lat, lng);
      },
      err => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 30000 }
    );
  },

  get() {
    return this.current || Storage.getLocation();
  },

  _updateUI(lat, lng) {
    const el = document.getElementById('gps-status');
    if (el) el.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
};
