const NearbyServices = {
  async fetch(lat, lng) {
    const radius = 5000;
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"="hospital"](around:${radius},${lat},${lng});
        node["amenity"="police"](around:${radius},${lat},${lng});
        node["amenity"="clinic"](around:${radius},${lat},${lng});
        node["shop"="car_repair"](around:${radius},${lat},${lng});
        node["shop"="tyres"](around:${radius},${lat},${lng});
        node["amenity"="car_rental"](around:${radius},${lat},${lng});
      );
      out body;
    `;
    try {
      // 1. Fetch places from Overpass
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const json = await res.json();

      // Sort by straight-line first, take top 20 to avoid huge OSRM request
      let services = json.elements.map(el => ({
        id: el.id,
        name: el.tags.name || this._typeLabel(el.tags),
        type: this._type(el.tags),
        phone: el.tags.phone || el.tags['contact:phone'] || null,
        lat: el.lat,
        lng: el.lon,
        dist: this._straightLine(lat, lng, el.lat, el.lon),
        distLabel: ''
      })).sort((a,b) => a.dist - b.dist).slice(0, 20);

      // 2. Get road distances from OSRM table API (returns durations in seconds)
      try {
        const coords = [`${lng},${lat}`, ...services.map(s => `${s.lng},${s.lat}`)].join(';');
        const osrmRes = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0`);
        const osrmJson = await osrmRes.json();

        if (osrmJson.code === 'Ok' && osrmJson.durations && osrmJson.durations[0]) {
          const durations = osrmJson.durations[0]; // seconds from user to each dest
          services = services.map((s, i) => {
            const secs = durations[i + 1]; // +1 skips index 0 (user's own location)
            if (secs == null) return { ...s, distLabel: this._fallbackLabel(s.dist) };
            // Estimate road distance: assume avg 40km/h in urban area
            const meters = secs * (40000 / 3600);
            return {
              ...s,
              dist: meters,
              distLabel: meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`
            };
          }).sort((a, b) => a.dist - b.dist);
        } else {
          services = services.map(s => ({ ...s, distLabel: this._fallbackLabel(s.dist) }));
        }
      } catch {
        services = services.map(s => ({ ...s, distLabel: this._fallbackLabel(s.dist) }));
      }

      Storage.setCachedServices(services);
      return services;
    } catch {
      const cached = Storage.getCachedServices();
      return cached ? cached.data : [];
    }
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
    return 'Service';
  },

  // Haversine — only used for initial sort before OSRM responds
  _straightLine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },

  _fallbackLabel(km) {
    return km < 1 ? `~${Math.round(km * 1000)}m` : `~${km.toFixed(1)}km`;
  }
};
