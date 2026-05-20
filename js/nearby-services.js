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
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const json = await res.json();
      const services = json.elements.map(el => ({
        id: el.id,
        name: el.tags.name || this._typeLabel(el.tags),
        type: this._type(el.tags),
        phone: el.tags.phone || el.tags['contact:phone'] || null,
        lat: el.lat,
        lng: el.lon,
        dist: this._dist(lat, lng, el.lat, el.lon)
      })).sort((a,b) => a.dist - b.dist);
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

  _dist(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
};
