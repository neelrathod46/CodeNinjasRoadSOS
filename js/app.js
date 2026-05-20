const App = {
  history: [],
  deferredPrompt: null,

  init() {
    Geo.start();
    CrashDetection.start();
    this.renderHome();
    this.show('home');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
    });

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      document.addEventListener('click', async () => {
        await DeviceMotionEvent.requestPermission().catch(() => {});
      }, { once: true });
    }
  },

  show(screenName, pushHistory = true) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenName}`).classList.add('active');
    if (pushHistory) this.history.push(screenName);
  },

  back() {
    if (this.history.length <= 1) return;
    this.history.pop();
    const prev = this.history[this.history.length - 1];
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${prev}`).classList.add('active');
  },

  showSOS(trigger = 'manual') {
    this.renderSOS(trigger);
    this.show('sos');
  },

  renderHome() {
    const medical = Storage.getMedicalID();
    const contacts = Storage.getContacts();
    const settings = Storage.getSettings();
    const name = medical.name || 'there';
    const hasContacts = contacts.length > 0;
    const loc = Storage.getLocation();

    document.getElementById('screen-home').innerHTML = `
      <div class="status-bar">
        <span>CrashSafe</span>
        <span id="gps-status">${loc ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : 'Getting GPS...'}</span>
      </div>

      <div class="home-header">
        <div class="home-greeting">Ready to protect</div>
        <div class="home-name">HI, ${name.split(' ')[0].toUpperCase() || 'THERE'}</div>
        <div class="home-gps">
          <div class="gps-dot"></div>
          <span id="gps-address">${loc ? 'System active & armed' : 'Acquiring location...'}</span>
        </div>
      </div>

      ${!hasContacts ? `
        <div style="margin: 0 20px 16px; background: rgba(232,25,44,0.1); border: 1px solid rgba(232,25,44,0.3); border-radius: 12px; padding: 14px 16px; font-size: 13px; color: rgba(255,255,255,0.8);">
          ⚠️ No emergency contacts set — add one under Contacts
        </div>
      ` : ''}

      <div class="sos-wrap">
        <button class="sos-btn" id="sos-btn" onclick="App.showSOS('manual')">
          <div class="sos-label">SOS</div>
          <div class="sos-sub">Tap to trigger emergency alert</div>
        </button>
      </div>

      <div class="grid-2">
        <div class="quick-card" onclick="App.renderNearby(); App.show('nearby')">
          <div class="quick-icon">🏥</div>
          <div>
            <div class="quick-label">Nearby help</div>
            <div class="quick-sub">Hospitals & services</div>
          </div>
        </div>
        <div class="quick-card" onclick="App.renderMedical(); App.show('medical')">
          <div class="quick-icon">🩺</div>
          <div>
            <div class="quick-label">Medical ID</div>
            <div class="quick-sub">Blood type, allergies</div>
          </div>
        </div>
        <div class="quick-card" onclick="App.renderContacts(); App.show('contacts')">
          <div class="quick-icon">📞</div>
          <div>
            <div class="quick-label">Contacts</div>
            <div class="quick-sub">${hasContacts ? `${contacts.length} saved` : 'None added yet'}</div>
          </div>
        </div>
        <div class="quick-card" onclick="App.renderSettings(); App.show('settings')">
          <div class="quick-icon">⚙️</div>
          <div>
            <div class="quick-label">Settings</div>
            <div class="quick-sub">SOS configuration</div>
          </div>
        </div>
      </div>

      <div class="detection-bar" style="cursor: pointer;" onclick="CrashDetection.simulateSpike()">
        <div class="detection-text">
          <div class="detection-title">Crash detection (Tap to test)</div>
          <div class="detection-sub" id="detection-status-text">
            ${settings.detectionOn ? 'Live Force: <span id="live-accel" style="color:var(--green); font-weight:700;">0.0 m/s²</span>' : 'Currently off'}
          </div>
        </div>
        <button class="toggle ${settings.detectionOn ? '' : 'off'}" id="detection-toggle" onclick="event.stopPropagation(); App.toggleDetection()"></button>
      </div>
    `;
  },

  toggleDetection() {
    const s = Storage.getSettings();
    s.detectionOn = !s.detectionOn;
    Storage.set('settings', s);
    CrashDetection.setEnabled(s.detectionOn);
    this.renderHome();
  },

  renderSOS(trigger) {
    const settings = Storage.getSettings();
    const contacts = Storage.getContacts();
    const sosNumber = settings.sosNumber || '911';
    let count = settings.countdownSecs || 10;
    let interval;

    document.getElementById('screen-sos').innerHTML = `
      <div style="flex:1; background: var(--red-dark); display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 24px; text-align:center;">
        ${trigger === 'manual' ? `<button onclick="App._cancelSOS()" style="position:absolute;top:20px;left:20px;background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:10px;padding:10px 16px;font-size:14px;cursor:pointer;">← Cancel</button>` : ''}
        <div style="font-family:var(--font-display);font-size:96px;color:#fff;line-height:1;" id="sos-count">${count}</div>
        <div style="font-size:22px;font-weight:600;color:#fff;margin:8px 0 6px;">Crash detected</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.75);margin-bottom:40px;">Contacting dispatch in <span id="sos-count-inline">${count}</span>s</div>

        <div style="width:100%;display:flex;flex-direction:column;gap:12px;">
          <a href="tel:${sosNumber}" id="native-call-trigger" class="btn btn-xl btn-red" style="background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.4);" onclick="clearInterval(window._sosInterval)">
            📞 Call ${sosNumber} now
          </a>
          <button class="btn btn-xl btn-blue" onclick="App._skipToHospitals()">
            🏥 Show nearby hospitals
          </button>
          <button class="btn btn-lg btn-green" onclick="App._cancelSOS()">
            ✓ I'm okay — dismiss
          </button>
        </div>
      </div>
    `;

    interval = setInterval(() => {
      count--;
      const el = document.getElementById('sos-count');
      const el2 = document.getElementById('sos-count-inline');
      if (el) el.textContent = count;
      if (el2) el2.textContent = count;
      if (count <= 0) {
        clearInterval(interval);
        this._fireSOS();
      }
    }, 1000);

    window._sosInterval = interval;
  },

  _fireSOS() {
    clearInterval(window._sosInterval);
    const settings = Storage.getSettings();
    const contacts = Storage.getContacts();
    const loc = Geo.get();
    
    const locText = loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'unknown location';
    const msg = `CRASH ALERT: I've been in an accident. Last tracked location: ${locText}.`;

    if (contacts.length > 0) {
      const isAndroid = /Android/i.test(navigator.userAgent);
      const separator = isAndroid ? ';' : ',';
      const numbersList = contacts.map(c => c.number).join(separator);
      window.location.href = `sms:${numbersList}?body=${encodeURIComponent(msg)}`;
    } else {
      window.location.href = `tel:${settings.sosNumber || '911'}`;
    }
  },

  _cancelSOS() {
    clearInterval(window._sosInterval);
    this.back();
  },

  _skipToHospitals() {
    clearInterval(window._sosInterval);
    this.renderNearby('hospital');
    this.show('nearby');
  },

  renderNearby(filterType = null) {
    const loc = Geo.get() || { lat: 0, lng: 0 };
    document.getElementById('screen-nearby').innerHTML = `
      <div class="status-bar">
        <button onclick="App.back()" style="background:none;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;">← Back</button>
        <span style="font-weight:600;">Nearby Services</span>
        <span></span>
      </div>
      <div style="padding:0 20px 20px;flex:1;overflow-y:auto;" id="services-list">
        <div style="color:var(--text-muted);font-size:14px;padding:20px 0;">Searching services database...</div>
      </div>
    `;

    NearbyServices.fetch(loc.lat, loc.lng).then(services => {
      const filtered = filterType ? services.filter(s => s.type === filterType) : services;
      const icons = { hospital: '🏥', police: '🚔', repair: '🔧' };

      document.getElementById('services-list').innerHTML = filtered.map(s => `
        <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:14px;background:var(--surface);padding:14px;border-radius:12px;border:1px solid var(--border);">
          <div style="font-size:28px;">${icons[s.type] || '📍'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">${s.distLabel} away</div>
          </div>
          <a href="${s.phone ? `tel:${s.phone}` : '#'}" class="btn btn-md btn-blue" style="width:auto;padding:8px 14px;border-radius:8px;">
            ${s.phone ? 'Call' : 'View'}
          </a>
        </div>
      `).join('');
    });
  },

  renderMedical() {
    const m = Storage.getMedicalID();
    document.getElementById('screen-medical').innerHTML = `
      <div class="status-bar">
        <button onclick="App.back()" style="background:none;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;">← Back</button>
        <span style="font-weight:600;">Medical ID</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;">
        ${['name:Full name', 'blood:Blood type', 'allergies:Allergies'].map(pair => {
          const [key, label] = pair.split(':');
          return `
            <div style="margin-bottom:16px;">
              <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">${label}</label>
              <input type="text" value="${m[key] || ''}" data-key="${key}" oninput="App._saveMedical(this)"
                style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-size:16px;">
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  _saveMedical(input) {
    const m = Storage.getMedicalID();
    m[input.dataset.key] = input.value;
    Storage.set('medical_id', m);
  },

  renderContacts() {
    const contacts = Storage.getContacts();
    document.getElementById('screen-contacts').innerHTML = `
      <div class="status-bar">
        <button onclick="App.back()" style="background:none;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;">← Back</button>
        <span style="font-weight:600;">Contacts</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;" id="contacts-list">
        ${contacts.map((c, i) => `
          <div style="background:var(--surface);padding:12px;border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <div><b>${c.name}</b><br><small style="color:var(--text-muted);">${c.number}</small></div>
            <button onclick="App._deleteContact(${i})" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;">🗑</button>
          </div>
        `).join('')}
      </div>
      <div style="padding:20px;">
        <input type="text" id="new-name" placeholder="Name" style="width:100%;background:var(--surface);border:1px solid var(--border);padding:12px;color:#fff;margin-bottom:6px;border-radius:8px;">
        <input type="tel" id="new-number" placeholder="Phone" style="width:100%;background:var(--surface);border:1px solid var(--border);padding:12px;color:#fff;margin-bottom:10px;border-radius:8px;">
        <button class="btn btn-lg btn-blue" onclick="App._addContact()">Add Contact</button>
      </div>
    `;
  },

  _addContact() {
    const name = document.getElementById('new-name').value.trim();
    const number = document.getElementById('new-number').value.trim();
    if (!name || !number) return;
    const contacts = Storage.getContacts();
    contacts.push({ name, number });
    Storage.set('contacts', contacts);
    this.renderContacts();
  },

  _deleteContact(i) {
    const contacts = Storage.getContacts();
    contacts.splice(i, 1);
    Storage.set('contacts', contacts);
    this.renderContacts();
  },

  renderSettings() {
    const s = Storage.getSettings();
    document.getElementById('screen-settings').innerHTML = `
      <div class="status-bar">
        <button onclick="App.back()" style="background:none;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;">← Back</button>
        <span style="font-weight:600;">Settings</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;">
        
        <div style="margin-bottom: 24px;">
          <button class="btn btn-lg btn-green" onclick="App.triggerPWAInstall()" style="width:100%; font-weight:700;">
            📲 Install App To Dashboard
          </button>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">Emergency SOS Line</label>
          <input type="tel" value="${s.sosNumber}" id="sos-number-input"
            style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;">
        </div>

        <div style="margin-bottom:24px;">
          <label id="sens-label" style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">
            Crash Threshold Force: <b>${s.sensitivity || 25} m/s²</b>
          </label>
          <input type="range" min="15" max="40" value="${s.sensitivity || 25}" id="sens-input" style="width:100%;"
            oninput="document.getElementById('sens-label').querySelector('b').textContent = this.value + ' m/s²'">
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-top:4px;">
            <span>15 (Highly Sensitive)</span>
            <span>40 (Low Sensitivity)</span>
          </div>
        </div>

        <button class="btn btn-lg btn-blue" onclick="App._saveSettings()">Save Settings</button>
      </div>
    `;
  },

  _saveSettings() {
    const s = Storage.getSettings();
    s.sosNumber = document.getElementById('sos-number-input').value.trim();
    s.sensitivity = parseInt(document.getElementById('sens-input').value);
    Storage.set('settings', s);
    CrashDetection.start(); 
    alert('Settings successfully updated.');
  },

  async triggerPWAInstall() {
    if (!this.deferredPrompt) {
      alert("Installation prepped! If browser system windows do not appear instantly, open your mobile browser dropdown configuration settings menu manually and select 'Add to Home Screen'.");
      return;
    }
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') console.log('PWA Accepted');
    this.deferredPrompt = null;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());