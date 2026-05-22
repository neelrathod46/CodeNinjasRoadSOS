const App = {
  history: [],
  deferredPrompt: null,
  _nearbyServices: [],
  _chatMode: 'online',
  _chatHistory: [],

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
        <div class="home-name">HI, ${(name.split(' ')[0] || 'THERE').toUpperCase()}</div>
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
            <div class="quick-label">Nearby Help</div>
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

      <!-- AI Chat full-width card -->
      <div style="padding: 0 20px 12px;">
        <div class="quick-card ai-card" onclick="App._chatHistory=[]; App.renderChat(); App.show('chat')" style="flex-direction:row; align-items:center; gap:16px; padding: 18px 20px;">
          <div class="quick-icon" style="font-size:30px;">🤖</div>
          <div style="flex:1;">
            <div class="quick-label">AI Emergency Assistant</div>
            <div class="quick-sub">First aid · Car repair · Nearby services</div>
          </div>
          <div style="background:var(--blue);color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;white-space:nowrap;">Ask AI →</div>
        </div>
      </div>

      <div class="detection-bar" style="cursor: pointer;" onclick="CrashDetection.simulateSpike()">
        <div class="detection-text">
          <div class="detection-title">Crash Detection <span style="font-size:11px;color:var(--text-muted);font-weight:400;">(tap to test)</span></div>
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
        ${trigger === 'manual' ? `
          <button onclick="App._cancelSOS()" class="btn-back" style="position:absolute;top:20px;left:20px;background:rgba(0,0,0,0.4);border-color:rgba(255,255,255,0.25);color:#fff;">
            ← Cancel
          </button>` : ''}
        <div style="font-family:var(--font-display);font-size:96px;color:#fff;line-height:1;" id="sos-count">${count}</div>
        <div style="font-size:22px;font-weight:600;color:#fff;margin:8px 0 6px;">Crash Detected</div>
        <div style="font-size:15px;color:rgba(255,255,255,0.75);margin-bottom:40px;">Contacting dispatch in <span id="sos-count-inline">${count}</span>s</div>

        <div style="width:100%;display:flex;flex-direction:column;gap:12px;">
          <a href="tel:${sosNumber}" id="native-call-trigger" class="btn btn-xl btn-red" style="background:rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.4);" onclick="clearInterval(window._sosInterval)">
            📞 Call ${sosNumber} now
          </a>
          <button class="btn btn-xl btn-blue" onclick="App._skipToHospitals()">
            🏥 Show Nearby Hospitals
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

  // ─── NEARBY SERVICES ────────────────────────────────────────────────────────

  renderNearby(filterType = null) {
    const loc = Geo.get() || { lat: 0, lng: 0 };

    document.getElementById('screen-nearby').innerHTML = `
      <div class="status-bar">
        <button class="btn-back" onclick="App.back()">← Back</button>
        <span style="font-weight:600;">Nearby Services</span>
        <span></span>
      </div>
      <div style="padding:0 20px 20px;flex:1;overflow-y:auto;">
        <div style="display:flex;gap:8px;margin:10px 0 16px;overflow-x:auto;padding-bottom:4px;" id="filter-tabs">
          <button onclick="App._renderServiceList('all')"      class="chip chip-active" data-filter="all">All</button>
          <button onclick="App._renderServiceList('hospital')" class="chip" data-filter="hospital">🏥 Medical</button>
          <button onclick="App._renderServiceList('police')"   class="chip" data-filter="police">🚔 Police</button>
          <button onclick="App._renderServiceList('repair')"   class="chip" data-filter="repair">🔧 Repair</button>
        </div>
        <div id="services-list">
          <div class="loading-state">
            <div style="font-size:36px;margin-bottom:14px;">🔍</div>
            <div>Searching nearby services…</div>
            <div style="font-size:12px;margin-top:6px;color:var(--text-muted)">Querying OpenStreetMap database</div>
          </div>
        </div>
      </div>
    `;

    NearbyServices.fetch(loc.lat, loc.lng)
      .then(services => {
        this._nearbyServices = services;
        this._renderServiceList(filterType || 'all');
      })
      .catch(() => {
        const list = document.getElementById('services-list');
        if (list) list.innerHTML = `<div class="loading-state">⚠️<br><br>Could not load services.<br><small style="color:var(--text-muted)">Check your connection or try again.</small></div>`;
      });
  },

  _renderServiceList(filterType) {
    const list = document.getElementById('services-list');
    if (!list) return;

    // Update active filter tab
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.classList.toggle('chip-active', btn.dataset.filter === filterType);
    });

    const icons = { hospital: '🏥', police: '🚔', repair: '🔧', other: '📍' };
    const typeLabels = { hospital: 'Hospital / Clinic', police: 'Police Station', repair: 'Car Repair', other: 'Service' };

    const filtered = filterType === 'all'
      ? this._nearbyServices
      : this._nearbyServices.filter(s => s.type === filterType);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="loading-state" style="color:var(--text-muted)">
        <div style="font-size:36px;margin-bottom:12px;">😕</div>
        No ${filterType === 'all' ? '' : filterType + ' '}services found nearby.
        <br><small style="font-size:12px;">Try expanding the search or check GPS signal.</small>
      </div>`;
      return;
    }

    list.innerHTML = filtered.slice(0, 25).map(s => `
      <div class="service-card">
        <div class="service-card-icon">${icons[s.type] || '📍'}</div>
        <div class="service-card-info">
          <div class="service-card-name">${s.name}</div>
          <div class="service-card-meta">${typeLabels[s.type] || 'Service'} · <b style="color:var(--text)">${s.distLabel}</b></div>
          ${s.phone ? `<a href="tel:${s.phone}" class="service-phone">📞 ${s.phone}</a>` : ''}
        </div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" class="btn-directions">
          Go →
        </a>
      </div>
    `).join('');
  },

  // ─── MEDICAL ID ──────────────────────────────────────────────────────────────

  renderMedical() {
    const m = Storage.getMedicalID();
    const fields = [
      { key: 'name',       label: 'Full Name',          type: 'text' },
      { key: 'blood',      label: 'Blood Type',         type: 'text', placeholder: 'e.g. A+' },
      { key: 'allergies',  label: 'Allergies',          type: 'text' },
      { key: 'conditions', label: 'Medical Conditions', type: 'text' },
      { key: 'medications',label: 'Medications',        type: 'text' },
    ];
    document.getElementById('screen-medical').innerHTML = `
      <div class="status-bar">
        <button class="btn-back" onclick="App.back()">← Back</button>
        <span style="font-weight:600;">Medical ID</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;">
        ${fields.map(f => `
          <div style="margin-bottom:16px;">
            <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">${f.label}</label>
            <input type="${f.type}" value="${m[f.key] || ''}" data-key="${f.key}"
              placeholder="${f.placeholder || ''}"
              oninput="App._saveMedical(this)"
              style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-size:16px;font-family:var(--font-body);">
          </div>
        `).join('')}
      </div>
    `;
  },

  _saveMedical(input) {
    const m = Storage.getMedicalID();
    m[input.dataset.key] = input.value;
    Storage.set('medical_id', m);
  },

  // ─── CONTACTS ────────────────────────────────────────────────────────────────

  renderContacts() {
    const contacts = Storage.getContacts();
    document.getElementById('screen-contacts').innerHTML = `
      <div class="status-bar">
        <button class="btn-back" onclick="App.back()">← Back</button>
        <span style="font-weight:600;">Contacts</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;" id="contacts-list">
        ${contacts.length === 0 ? `<div style="color:var(--text-muted);padding:30px 0;text-align:center;font-size:14px;">No contacts yet. Add one below.</div>` : ''}
        ${contacts.map((c, i) => `
          <div style="background:var(--surface);padding:14px 16px;border-radius:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);">
            <div>
              <div style="font-weight:600;font-size:15px;">${c.name}</div>
              <div style="color:var(--text-muted);font-size:13px;margin-top:2px;">${c.number}</div>
            </div>
            <button onclick="App._deleteContact(${i})" style="background:rgba(232,25,44,0.15);border:1px solid rgba(232,25,44,0.3);color:var(--red);font-size:14px;cursor:pointer;padding:8px 12px;border-radius:8px;">Remove</button>
          </div>
        `).join('')}
      </div>
      <div style="padding:20px;">
        <input type="text" id="new-name" placeholder="Contact name"
          style="width:100%;background:var(--surface);border:1px solid var(--border);padding:14px 16px;color:#fff;margin-bottom:8px;border-radius:10px;font-size:15px;font-family:var(--font-body);">
        <input type="tel" id="new-number" placeholder="Phone number"
          style="width:100%;background:var(--surface);border:1px solid var(--border);padding:14px 16px;color:#fff;margin-bottom:12px;border-radius:10px;font-size:15px;font-family:var(--font-body);">
        <button class="btn btn-lg btn-blue" onclick="App._addContact()">+ Add Contact</button>
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

  // ─── SETTINGS ────────────────────────────────────────────────────────────────

  renderSettings() {
    const s = Storage.getSettings();
    document.getElementById('screen-settings').innerHTML = `
      <div class="status-bar">
        <button class="btn-back" onclick="App.back()">← Back</button>
        <span style="font-weight:600;">Settings</span>
        <span></span>
      </div>
      <div style="padding:0 20px;flex:1;overflow-y:auto;">

        <div style="margin-bottom:24px;">
          <button class="btn btn-lg btn-green" onclick="App.triggerPWAInstall()" style="width:100%;font-weight:700;">
            📲 Install App to Home Screen
          </button>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">Emergency SOS Number</label>
          <input type="tel" value="${s.sosNumber}" id="sos-number-input"
            style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;color:#fff;font-family:var(--font-body);font-size:16px;">
        </div>

        <div style="margin-bottom:24px;">
          <label id="sens-label" style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px;">
            Crash Threshold Force: <b>${s.sensitivity || 25} m/s²</b>
          </label>
          <input type="range" min="15" max="40" value="${s.sensitivity || 25}" id="sens-input" style="width:100%;"
            oninput="document.getElementById('sens-label').querySelector('b').textContent = this.value + ' m/s²'">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px;">
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
    alert('Settings saved.');
  },

  async triggerPWAInstall() {
    if (!this.deferredPrompt) {
      alert("To install: open your browser menu and select 'Add to Home Screen'.");
      return;
    }
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') console.log('PWA installed');
    this.deferredPrompt = null;
  },

  // ─── CHAT ────────────────────────────────────────────────────────────────────

  renderChat() {
    document.getElementById('screen-chat').innerHTML = `
      <div class="status-bar">
        <button class="btn-back" onclick="App.back()">← Back</button>
        <span style="font-weight:600;">Emergency Assistant</span>
        <button id="mode-toggle" onclick="App._toggleChatMode()" class="mode-badge ${this._chatMode}">
          ${this._chatMode === 'online' ? '🌐 Online AI' : '📴 Offline'}
        </button>
      </div>

      <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
          <div class="msg msg-bot">
            👋 Hi, I'm your emergency assistant.<br><br>
            I can help with:<br>
            • <b>First aid</b> — CPR, bleeding, burns, fractures<br>
            • <b>Car repairs</b> — flat tyre, overheating, dead battery<br>
            • <b>Finding help</b> — hospitals, police, mechanics nearby<br><br>
            <span style="color:var(--text-muted);font-size:12px;">
              🌐 Online mode uses Claude AI for detailed answers.<br>
              📴 Offline mode works without internet.
            </span>
          </div>
        </div>

        <div class="chat-chips" id="chat-chips">
          <div class="chip" onclick="App._quickChat('How do I perform CPR?')">💓 CPR</div>
          <div class="chip" onclick="App._quickChat('How do I stop severe bleeding?')">🩸 Bleeding</div>
          <div class="chip" onclick="App._quickChat('How do I treat a burn?')">🔥 Burns</div>
          <div class="chip" onclick="App._quickChat('Someone may have a broken bone, what do I do?')">🦴 Fracture</div>
          <div class="chip" onclick="App._quickChat('My tyre is flat. What are the steps to change it?')">🚗 Flat Tyre</div>
          <div class="chip" onclick="App._quickChat('My car is overheating. What should I do?')">🌡️ Overheating</div>
          <div class="chip" onclick="App._quickChat('My car battery is dead. How do I jump start it?')">🔋 Dead Battery</div>
          <div class="chip" onclick="App._quickChat('Find the nearest hospital')">🏥 Hospital</div>
          <div class="chip" onclick="App._quickChat('Find the nearest police station')">🚔 Police</div>
          <div class="chip" onclick="App._quickChat('Find the nearest car repair shop')">🔧 Mechanic</div>
        </div>

        <div class="chat-input-wrap">
          <input type="text" id="chat-input" class="chat-input" placeholder="Ask an emergency question…"
            onkeypress="if(event.key==='Enter') App._sendChat()">
          <button class="btn-send" onclick="App._sendChat()">➤</button>
        </div>
      </div>
    `;
  },

  _toggleChatMode() {
    this._chatMode = this._chatMode === 'online' ? 'offline' : 'online';
    const btn = document.getElementById('mode-toggle');
    if (!btn) return;
    btn.textContent = this._chatMode === 'online' ? '🌐 Online AI' : '📴 Offline';
    btn.className = `mode-badge ${this._chatMode}`;
  },

  _quickChat(text) {
    const input = document.getElementById('chat-input');
    if (input) input.value = text;
    this._sendChat();
  },

  async _sendChat() {
    const inputEl = document.getElementById('chat-input');
    const text = inputEl ? inputEl.value.trim() : '';
    if (!text) return;

    const msgContainer = document.getElementById('chat-messages');
    msgContainer.innerHTML += `<div class="msg msg-user">${text}</div>`;
    if (inputEl) inputEl.value = '';
    msgContainer.scrollTop = msgContainer.scrollHeight;

    // ── Check for location/service requests first ──
    const lower = text.toLowerCase();
    const isLocationRequest =
      lower.includes('hospital') || lower.includes('clinic') || lower.includes('medical') ||
      lower.includes('police') || lower.includes('mechanic') || lower.includes('repair') ||
      lower.includes('nearest') || lower.includes('nearby') || lower.includes('find');

    if (isLocationRequest) {
      const typeMap = {
        hospital: 'hospital', clinic: 'hospital', medical: 'hospital',
        police: 'police', cop: 'police',
        mechanic: 'repair', repair: 'repair', garage: 'repair'
      };
      let targetType = null;
      for (const [kw, type] of Object.entries(typeMap)) {
        if (lower.includes(kw)) { targetType = type; break; }
      }

      this._addTypingIndicator(msgContainer);
      try {
        const loc = Geo.get() || { lat: 0, lng: 0 };
        const services = await NearbyServices.fetch(loc.lat, loc.lng);
        const relevant = targetType ? services.filter(s => s.type === targetType) : services;
        const top = relevant.slice(0, 4);

        this._removeTypingIndicator();
        const icons = { hospital: '🏥', police: '🚔', repair: '🔧', other: '📍' };

        if (top.length > 0) {
          const html = `Here are the closest options near you:<br><br>` +
            top.map(s =>
              `${icons[s.type] || '📍'} <b>${s.name}</b><br>` +
              `<span style="color:var(--text-muted);font-size:13px;">${s.distLabel} away</span><br>` +
              `<a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" style="color:var(--blue);font-size:13px;">📍 Get Directions</a>` +
              (s.phone ? ` · <a href="tel:${s.phone}" style="color:var(--green);font-size:13px;">📞 Call</a>` : '')
            ).join('<br><br>');
          msgContainer.innerHTML += `<div class="msg msg-bot">${html}</div>`;
        } else {
          msgContainer.innerHTML += `<div class="msg msg-bot">No nearby services found in the database. If this is an emergency, use the <b>SOS button</b> immediately.</div>`;
        }
      } catch {
        this._removeTypingIndicator();
        msgContainer.innerHTML += `<div class="msg msg-bot">⚠️ Couldn't fetch nearby services. Check your connection.</div>`;
      }
      msgContainer.scrollTop = msgContainer.scrollHeight;
      return;
    }

    // ── AI response (online or offline) ──
    this._addTypingIndicator(msgContainer);

    if (this._chatMode === 'online') {
      try {
        const medical = Storage.getMedicalID();
        const systemPrompt = `You are an emergency first aid and roadside assistance AI built into the CrashSafe app. The user may be in or near a road accident. Provide clear, calm, step-by-step instructions.

Rules:
- Keep answers under 120 words
- Use numbered steps for procedures  
- Use <b>bold</b> for critical actions
- Start with the most important action
- Do NOT recommend calling an AI — focus on physical actions

User's medical info: Blood type: ${medical.blood || 'unknown'}, Allergies: ${medical.allergies || 'none known'}, Conditions: ${medical.conditions || 'none known'}.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 350,
            system: systemPrompt,
            messages: [
              ...this._chatHistory,
              { role: 'user', content: text }
            ]
          })
        });

        const data = await response.json();
        const reply = data.content?.[0]?.text || 'No response. Switch to Offline mode.';

        // Keep a short rolling history (last 6 turns)
        this._chatHistory.push({ role: 'user', content: text });
        this._chatHistory.push({ role: 'assistant', content: reply });
        if (this._chatHistory.length > 12) this._chatHistory = this._chatHistory.slice(-12);

        this._removeTypingIndicator();
        msgContainer.innerHTML += `<div class="msg msg-bot">${reply.replace(/\n/g, '<br>')}</div>`;
      } catch (err) {
        this._removeTypingIndicator();
        // Graceful offline fallback
        const fallback = this._processOfflineAI(lower);
        msgContainer.innerHTML += `
          <div class="msg msg-bot">
            <span style="color:var(--text-muted);font-size:12px;">⚠️ Online AI unavailable — offline response:</span><br><br>
            ${fallback}
          </div>`;
      }
    } else {
      // Pure offline
      setTimeout(() => {
        this._removeTypingIndicator();
        const response = this._processOfflineAI(lower);
        msgContainer.innerHTML += `<div class="msg msg-bot">${response}</div>`;
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }, 450);
    }

    msgContainer.scrollTop = msgContainer.scrollHeight;
  },

  _addTypingIndicator(container) {
    container.innerHTML += `<div class="msg msg-bot typing-indicator" id="typing-ind"><span></span><span></span><span></span></div>`;
    container.scrollTop = container.scrollHeight;
  },

  _removeTypingIndicator() {
    document.getElementById('typing-ind')?.remove();
  },

  _processOfflineAI(query) {
    if (query.includes('cpr') || (query.includes('heart') && query.includes('stop'))) {
      return `<b>CPR — Adult:</b><br>1. Check scene is safe. Call 911.<br>2. Place heel of hand on centre of chest.<br>3. Push down hard & fast — 100–120 compressions/min.<br>4. Allow full chest recoil between compressions.<br>5. If trained: give 2 rescue breaths every 30 compressions.<br>6. Continue until help arrives.`;
    }
    if (query.includes('bleed') || query.includes('blood') || (query.includes('cut') && !query.includes('car'))) {
      return `<b>Severe Bleeding:</b><br>1. <b>Apply firm direct pressure</b> with a clean cloth.<br>2. Press hard — do not remove cloth even if soaked; add more on top.<br>3. If limb, elevate above heart level.<br>4. If bleeding doesn't stop, apply a tourniquet 5–7 cm above wound.<br>5. Call emergency services immediately.`;
    }
    if (query.includes('burn') || query.includes('fire') || query.includes('scald')) {
      return `<b>Burns:</b><br>1. Remove from heat source safely.<br>2. <b>Cool under cool running water for 20 minutes.</b><br>3. Remove jewellery/clothing near the burn (not if stuck).<br>4. Cover loosely with a clean non-stick dressing.<br>5. Do NOT use ice, butter, or toothpaste.<br>6. Seek medical help for burns larger than a palm.`;
    }
    if (query.includes('fracture') || query.includes('broken') || query.includes('bone')) {
      return `<b>Suspected Fracture:</b><br>1. <b>Do not move the person</b> unless in immediate danger.<br>2. Immobilise the injured area — use clothing/padding as splints.<br>3. Apply ice wrapped in cloth to reduce swelling.<br>4. Keep the person still and calm.<br>5. Call emergency services.`;
    }
    if (query.includes('tyre') || query.includes('tire') || query.includes('flat')) {
      return `<b>Flat Tyre:</b><br>1. Pull over safely, turn on hazard lights.<br>2. Apply handbrake and place warning triangle behind car.<br>3. Loosen wheel nuts <i>before</i> jacking.<br>4. Jack the car at the correct jack point (check manual).<br>5. Remove flat, fit spare, hand-tighten nuts.<br>6. Lower jack, tighten nuts in star pattern.<br>7. Drive to a garage — spare tyres are for short distances only.`;
    }
    if (query.includes('overheat') || query.includes('temperature') || (query.includes('engine') && query.includes('hot'))) {
      return `<b>Overheating Engine:</b><br>1. <b>Do not open bonnet if steam is visible.</b><br>2. Turn off A/C, turn heater ON full — helps dissipate heat.<br>3. Pull over safely and turn off engine.<br>4. Wait 15–20 min before opening bonnet.<br>5. Check coolant level — top up with water if empty.<br>6. Call roadside assistance if problem persists.`;
    }
    if (query.includes('battery') || query.includes('jump') || query.includes('dead car')) {
      return `<b>Jump Starting:</b><br>1. Position working car engine-to-engine.<br>2. Connect <b style="color:#f90">RED cable</b> to dead battery (+), then working battery (+).<br>3. Connect <b style="color:#888">BLACK cable</b> to working battery (−), then unpainted metal on dead car (not battery).<br>4. Start working car, wait 3 min, then start dead car.<br>5. Remove cables in reverse order.<br>6. Drive for 20+ minutes to recharge.`;
    }
    if (query.includes('shock') || query.includes('unconscious') || query.includes('faint')) {
      return `<b>Shock / Unconscious Person:</b><br>1. Call emergency services immediately.<br>2. Lay person flat, raise legs 30 cm if no spine injury.<br>3. Keep warm with a blanket.<br>4. If unconscious but breathing: <b>recovery position</b> — on their side.<br>5. Check breathing every 2 minutes.<br>6. Do not give food or drink.`;
    }
    return `I can help with first aid and car repair offline. Try asking about:<br><br>💓 CPR · 🩸 Bleeding · 🔥 Burns · 🦴 Fractures · 😵 Shock<br>🚗 Flat tyre · 🌡️ Overheating · 🔋 Dead battery<br><br>For emergencies, use the <b>SOS button</b> on the home screen.`;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
