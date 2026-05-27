const NearbyServices = {
  _OVERPASS_ENDPOINTS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ],

  async fetch(lat, lng) {
    const radius = 5000;

    const query = `
      [out:json][timeout:15];
      (
        nwr["amenity"="hospital"](around:${radius},${lat},${lng});
        nwr["amenity"="police"](around:${radius},${lat},${lng});
        nwr["amenity"="clinic"](around:${radius},${lat},${lng});
        nwr["shop"="car_repair"](around:${radius},${lat},${lng});
        nwr["shop"="tyres"](around:${radius},${lat},${lng});
        nwr["amenity"="car_rental"](around:${radius},${lat},${lng});
      );
      out center;
    `;

    try {
      const json = await this._fetchOverpass(query);

      const services = json.elements.map(el => {
        const plat = el.lat ?? el.center?.lat;
        const plng = el.lon ?? el.center?.lon;
        if (plat == null || plng == null) return null;

        const distM = this._haversineMetres(lat, lng, plat, plng);
        return {
          id: el.id,
          name: el.tags?.name || this._typeLabel(el.tags || {}),
          type: this._type(el.tags || {}),
          phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
          lat: plat,
          lng: plng,
          dist: distM,
          distLabel: this._metresToLabel(distM)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 25);

      Storage.setCachedServices(services);
      return services;

    } catch {
      const cached = Storage.getCachedServices();
      return cached ? cached.data : [];
    }
  },

  // Tries each Overpass mirror in order using POST (correct method for complex queries)
  async _fetchOverpass(query) {
    let lastError;
    for (const endpoint of this._OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        // Try next mirror
      }
    }
    throw lastError;
  },

  _type(tags) {
    if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital';
    if (tags.amenity === 'police') return 'police';
    if (tags.shop === 'car_repair' || tags.shop === 'tyres') return 'repair';
    return 'other';
  },

  _typeLabel(tags) {
    if (tags.amenity === 'hospital') return 'Hospital';
    if (tags.amenity === 'clinic') return 'Clinic';
    if (tags.amenity === 'police') return 'Police Station';
    if (tags.shop === 'car_repair') return 'Car Repair Shop';
    if (tags.shop === 'tyres') return 'Tyre Shop';
    if (tags.amenity === 'car_rental') return 'Car Rental';
    return 'Service';
  },

  // Returns distance in METRES (Haversine formula)
  _haversineMetres(lat1, lng1, lat2, lng2) {
    const R = 6_371_000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  _metresToLabel(metres) {
    return metres < 1000
      ? `${Math.round(metres)}m`
      : `${(metres / 1000).toFixed(1)}km`;
  }
};