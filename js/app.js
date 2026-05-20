const App = {
  history: [],
  deferredPrompt: null, // Track installation request payload

  init() {
    Geo.start();
    CrashDetection.start();
    this.renderHome();
    this.show('home');
    
    // Capture the PWA install event trigger
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e; // Store event payload
      
      // If user is currently sitting on settings screen, update UI instantly to reveal button
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) installBtn.style.display = 'block';
    });

    // Request device motion permissions cleanly on user interaction
    document.addEventListener('click', async () => {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const permissionState = await DeviceMotionEvent.requestPermission();
          if (permissionState === 'granted') {
            // Re-initialize listener once permission is unlocked
            CrashDetection.start(); 
          }
        } catch (err) {
          console.warn("DeviceMotion permissions deferred/denied:", err);
        }
      }
    }, { once: true });
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
          <span id="gps-address">${loc ? 'Location saved offline' : 'Acquiring location...'}</span>
        </div>
      </div>

      ${!hasContacts ? `
        <div style="margin: 0 20px 16px; background: rgba(232,25,44,0.1); border: 1px solid rgba(232,25,44,0.3); border-radius: 12px; padding: 14px 16px; font-size: 13px; color: rgba(255,255,255,0.8);">
          ⚠️ No emergency contacts set — add one so someone gets notified in a crash
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
            <div class="quick-sub">Hospitals, police, repairs</div>
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
            <div class="quick-sub">SOS number, detection</div>
          </div>
        </div>
      </div>

      <div class="detection-bar" style="cursor: pointer;" onclick="CrashDetection.simulateSpike()">
        <div class="detection-text">
          <div class="detection-title">Crash detection (Sensor)</div>
          <div class="detection-sub" id="detection-status-text">
            ${settings.detectionOn ? 'Live Force: <span id="live-accel" style="color:var(--green); font-weight:700;">0.0 m/s²</span>' : 'Currently off'}
          </div>
        </div>
        <button class="toggle ${settings.detectionOn ? '' : 'off'}" id="detection-toggle" onclick="event.stopPropagation(); App.toggleDetection()"></button>
      </div>
      <div style="text-align: center; font-size: 11px; color: var(--text-muted); margin-top: -16px; margin-bottom: 20px;">
         💡 Hackathon Tip: Tap the sensor bar to simulate a high-speed vehicle impact crash.
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
    const loc = Geo.get();
    const sosNumber = settings.sosNumber || '0000000000';
    let count = settings.countdownSecs || 10;
    let interval;

    document.getElementById('screen-sos').innerHTML = `
      <div style="flex:1; background: var(--red-dark); display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 24px; text-align:center;">
        ${trigger === 'manual' ? `<button onclick="App.back()" style="position:absolute;top:20px;left:20px;background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:10px;padding:10px 16px;font-size:14px;cursor:pointer;">← Back</button>` : ''}
        <div style="font-family:var(--font-display);font-size:96px;color:#fff;line-height:1;" id="sos-count">${count}</div>
        <div style="font-size:22px;font-weight:600;color:#fff;margin:8px 0 6px;">Crash detected</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.75);margin-bottom:40px;">Calling ${sosNumber} in <span id="sos-count-inline">${count}</span>s</div>

        <div style="width:100%;display:flex;flex-direction:column;gap:12px;">
          <a href="tel:${sosNumber}" class="btn btn-xl btn-red" style="background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.4);" onclick="App._fireSOS()">
            📞 Call ${sosNumber} now
          </a>
          <button class="btn btn-xl btn-blue" onclick="App._skipToHospitals()">
            🏥 Show nearby hospitals
          </button>
          <button class="btn btn-lg btn-green" onclick="App._cancelSOS()">
            ✓ I'm okay — cancel
          </button>
        </div>

        <div style="margin-top:28px;background:rgba(0,0,0,0.25);border-radius:12px;padding:14px 18px;width:100%;">
          <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:6px;">Notifying</div>
          <div style="font-size:14px;color:#fff;">${contacts.length ? contacts.map(c => c.name).join(' · ') : 'No contacts saved'}</div>
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
    const contacts = Storage.getContacts();
    const loc = Geo.get();
    const locText = loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'unknown location';
    const msg = `EMERGENCY: I've been in a crash. My location: ${locText}. Please help or call emergency services.`;
    contacts.forEach((c, i) => {
      setTimeout(() => {
        window.open(`sms:${c.number}?body=${encodeURIComponent(msg)}`, '_blank');
      }, i * 800);
    });
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
    const loc = Geo.get();
    document.getElementById('screen-nearby').innerHTML = `
      <div class="status-bar">
        <button onclick="App.back()" style="background:none;border:none;color:var(--text-muted);font-size:14px;cursor:pointer;">← Back</button>
        <span style="font-weight:600;">Nearby Help</span>
        <span></span>
      </div>
      <div style="padding:0 20px 20px;flex:1;overflow-y:auto;" id="services-list">
        <div style="color:var(--text-muted);font-size:14px;padding:20px 0;">Finding nearby services...</div>
      </div>
    `;

    if (!loc) {
      document.getElementById('services-list').innerHTML = `<div style="color:var(--text-muted);font-size:14px;padding:20px 0;">No location available. Enable GPS and try again.</div>`;
      return;
    }

    NearbyServices.fetch(loc.lat, loc.lng).then(services => {
      const filtered = filterType ? services.filter(s => s.type === filterType) : services;
      const icons = { hospital: '🏥', police: '🚔', repair: '🔧', other: '📍' };
      const labels = { hospital: 'Hospital / Clinic', police: 'Police Station', repair: 'Car Repair / Tyres', other: 'Other' };

      if (!filtered.length) {
        document.getElementById('services-list').innerHTML = `<div style="color:var(--text-muted);padding:20px 0;">No services found nearby. <a href="https://maps.google.com/?q=hospital+near+me" style="color:var(--blue);">Open Google Maps</a></div>`;
        return;
      }

      document.getElementById('services-list').innerHTML = filtered.map(s => `
        <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:14px;">
          <div style="font-size:28px;flex-shrink:0;">${icons[s.type]}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">${labels[s.type]} · ${s.distLabel} away</div>
          </div>
          ${s.phone ? `<a href="tel:${s.phone}" class="btn btn-md btn-red" style="width:auto;padding:0 16px;flex-shrink:0;">Call</a>` : `<a href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank" class="btn btn-md btn-ghost" style="width:auto;padding:0 16px;flex-shrink:0;">Map</a>`}
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
        ${['name:Full name', 'dob:Date of birth', 'blood:Blood type', 'allergies:Allergies', 'conditions:Medical conditions', 'medications:Medications'].map(pair => {
          const [key, label] = pair.split(':');
          return `
            <div style="margin-bottom:16px;">
              <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">${label}</label>
              <input type="text" value="${m[key] || ''}" data-key="${key}" oninput="App._saveMedical(this)"
                style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-size:16px;font-family:var(--font-body);">
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
        <span style="font-weight:600;">Emergency Contacts</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;" id="contacts-list">
        ${contacts.length ? contacts.map((c, i) => `
          <div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:14px;">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:15px;">${c.name}</div>
              <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">${c.number}</div>
            </div>
            <button onclick="App._deleteContact(${i})" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;">🗑</button>
          </div>
        `).join('') : '<div style="color:var(--text-muted);font-size:14px;padding:16px 0;">No contacts yet</div>'}
      </div>
      <div style="padding:20px;">
        <input type="text" id="new-name" placeholder="Name" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-size:16px;font-family:var(--font-body);margin-bottom:10px;">
        <input type="tel" id="new-number" placeholder="Phone number" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-size:16px;font-family:var(--font-body);margin-bottom:12px;">
        <button class="btn btn-lg btn-blue" onclick="App._addContact()">Add contact</button>
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
        <div id="pwa-install-btn" style="display: ${this.deferredPrompt ? 'block' : 'none'}; margin-bottom: 24px;">
          <button class="btn btn-lg btn-green" onclick="App.triggerPWAInstall()" style="width:100%; font-weight:700;">
            📲 Install CrashSafe App to Phone
          </button>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">Emergency SOS number</label>
          <input type="tel" value="${s.sosNumber}" id="sos-number-input"
            style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-size:16px;font-family:var(--font-body);">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">Countdown seconds (${s.countdownSecs}s)</label>
          <input type="range" min="5" max="30" value="${s.countdownSecs}" id="countdown-input" style="width:100%;"
            oninput="document.querySelector('label[for=countdown]').textContent = 'Countdown seconds (' + this.value + 's)'">
        </div>
        <button class="btn btn-lg btn-blue" onclick="App._saveSettings()" style="margin-top:8px;">Save settings</button>
      </div>
    `;
  },

  _saveSettings() {
    const s = Storage.getSettings();
    s.sosNumber = document.getElementById('sos-number-input').value.trim();
    s.countdownSecs = parseInt(document.getElementById('countdown-input').value);
    Storage.set('settings', s);
    alert('Settings saved');
  },
  async triggerPWAInstall() {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt(); // Trigger prompt dialog execution windows
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome== 'accepted') {
      console.log('User pinned web application to phone dashboard target.');
    }
    this.deferredPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());