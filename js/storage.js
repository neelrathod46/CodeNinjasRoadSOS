const Storage = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  getMedicalID() {
    return this.get('medical_id') || { name: '', dob: '', blood: '', allergies: '', conditions: '', medications: '' };
  },
  getContacts() {
    return this.get('contacts') || [];
  },
  getSettings() {
    return this.get('settings') || { sosNumber: '911', countdownSecs: 10, detectionOn: true, sensitivity: 25 };
  },
  getLocation() {
    return this.get('last_location') || null;
  },
  setLocation(lat, lng, address) {
    this.set('last_location', { lat, lng, address, ts: Date.now() });
  },
  getCachedServices() {
    return this.get('cached_services') || null;
  },
  setCachedServices(data) {
    this.set('cached_services', { data, ts: Date.now() });
  }
};