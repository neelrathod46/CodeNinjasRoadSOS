const Geo = {
  current: null,

  start() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.current = { lat, lng };
        
        // Fetch area name via Reverse Geocoding
        let areaName = "Location Acquired";
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`, {
            headers: { 'User-Agent': 'CrashSafePWA' }
          });
          const data = await res.json();
          if (data && data.address) {
            areaName = data.address.suburb || data.address.neighbourhood || data.address.village || data.address.city || "Unknown Area";
          }
        } catch (e) {
          areaName = Storage.getLocation()?.address || "Offline Area";
        }

        Storage.setLocation(lat, lng, areaName);
        this._updateUI(areaName, lat, lng);
      },
      err => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 30000 }
    );
  },

  get() {
    return this.current || Storage.getLocation();
  },

  _updateUI(areaName, lat, lng) {
    const coords = (lat != null && lng != null)
      ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      : null;
    const el = document.getElementById('gps-status');
    const elHome = document.getElementById('gps-address');
    if (el) el.textContent = coords ? `${areaName} · ${coords}` : areaName;
    if (elHome) elHome.textContent = coords ? `${areaName} · ${coords}` : areaName;
  }
};