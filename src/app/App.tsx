import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertTriangle,
  Phone,
  MessageSquare,
  Map,
  User,
  Send,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Navigation,
  Hospital,
  ShieldCheck,
  Wrench,
  Truck,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Loader,
} from "lucide-react";

// Fix leaflet default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

interface UserProfile {
  name: string;
  bloodGroup: string;
  conditions: string;
  contacts: EmergencyContact[];
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
}

interface GPSCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

type Tab = "sos" | "chat" | "map" | "profile";

// ─── LocalStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "crashguard_profile";

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: "", bloodGroup: "", conditions: "", contacts: [] };
}

function saveProfile(p: UserProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

// ─── Offline first-aid knowledge base ────────────────────────────────────────

const OFFLINE_RESPONSES: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["bleeding", "blood", "wound", "cut"],
    answer:
      "**Stop the bleeding:** Apply firm, direct pressure with a clean cloth. Do NOT remove the cloth — add more on top if it soaks through. Elevate the limb above heart level if possible. Maintain pressure for at least 10–15 minutes.",
  },
  {
    keywords: ["breathing", "breath", "inhale", "airway", "choking"],
    answer:
      "**Airway emergency:** Tilt the head back, lift the chin to open the airway. Check for breathing for 10 seconds. If absent, begin CPR — 30 chest compressions (hard and fast) then 2 rescue breaths. Continue until help arrives.",
  },
  {
    keywords: ["cpr", "cardiac", "heart", "pulse", "unconscious"],
    answer:
      "**CPR:** Place the heel of your hand on the center of the chest. Compress 5–6 cm deep at 100–120 per minute. Give 2 rescue breaths after every 30 compressions. Do not stop until EMS arrives or the person regains consciousness.",
  },
  {
    keywords: ["burn", "fire", "scald", "hot"],
    answer:
      "**Burns:** Cool with cool (not cold) running water for 20 minutes. Remove jewelry near the burn. Do NOT apply butter, toothpaste, or ice. Cover loosely with a sterile non-fluffy material. Seek emergency care for large or deep burns.",
  },
  {
    keywords: ["fracture", "broken", "bone", "spine", "neck", "back"],
    answer:
      "**Suspected fracture / spinal injury:** Do NOT move the person unless there is immediate danger. Immobilize the injured area in the position found. If they must be moved, support the head and neck in a neutral position. Await EMS.",
  },
  {
    keywords: ["shock", "pale", "faint", "dizzy", "weak"],
    answer:
      "**Shock:** Lay the person flat and raise their legs 20–30 cm (unless head, neck, or leg injury). Keep them warm. Do NOT give food or drink. Loosen tight clothing. Monitor breathing until help arrives.",
  },
  {
    keywords: ["head", "concussion", "skull", "hit head"],
    answer:
      "**Head injury:** Keep the person still and calm. Do NOT remove a helmet if worn. Watch for confusion, vomiting, unequal pupils, or loss of consciousness — these require immediate EMS. Apply gentle pressure to scalp wounds but do NOT press on the skull.",
  },
  {
    keywords: ["tire", "tyre", "flat", "puncture", "wheel"],
    answer:
      "**Flat tyre:** Move safely off the road and activate hazard lights. Apply the handbrake. Loosen wheel nuts before jacking. Jack under the vehicle's recommended lift points. Replace with spare, tighten nuts in a star pattern.",
  },
  {
    keywords: ["overheating", "overheat", "radiator", "steam", "engine hot"],
    answer:
      "**Engine overheating:** Pull over immediately, switch off the engine. Do NOT open the bonnet while steam is visible — wait 30 minutes. Never open the radiator cap on a hot engine. Call a tow service.",
  },
  {
    keywords: ["car fire", "smoke", "flames", "vehicle fire"],
    answer:
      "**Vehicle fire:** Stop and switch off the engine immediately. Everyone must exit — do NOT retrieve belongings. Move 100m away. Call emergency services. Never open the bonnet if you suspect an engine fire.",
  },
];

function offlineAnswer(input: string): string {
  const lower = input.toLowerCase();
  for (const { keywords, answer } of OFFLINE_RESPONSES) {
    if (keywords.some((k) => lower.includes(k))) return answer;
  }
  return "I couldn't find a specific match. For life-threatening emergencies call **112 / 911** immediately. Topics I cover: bleeding, CPR, breathing, burns, fractures, shock, head injury, flat tyre, overheating, vehicle fire.";
}

// ─── Map POI config ───────────────────────────────────────────────────────────

const POI_CATEGORIES = [
  { key: "hospital", label: "Hospitals",  icon: Hospital,    color: "#d42b2b", query: "amenity=hospital"  },
  { key: "police",   label: "Police",     icon: ShieldCheck, color: "#1d4ed8", query: "amenity=police"    },
  { key: "repair",   label: "Car Repair", icon: Wrench,      color: "#d97706", query: "shop=car_repair"   },
  { key: "tow",      label: "Tow/Rental", icon: Truck,       color: "#059669", query: "amenity=car_rental"},
] as const;

type POIKey = (typeof POI_CATEGORIES)[number]["key"];

interface POI {
  id: number;
  lat: number;
  lng: number;
  name: string;
  category: POIKey;
}

function makePOIIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

async function fetchPOIs(lat: number, lng: number, category: POIKey): Promise<POI[]> {
  const cat = POI_CATEGORIES.find((c) => c.key === category)!;
  const query = `[out:json][timeout:10];node[${cat.query}](around:3000,${lat},${lng});out 15;`;
  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  );
  const json = await res.json();
  return (json.elements || []).map((el: any) => ({
    id: el.id,
    lat: el.lat,
    lng: el.lon,
    name: el.tags?.name || cat.label,
    category,
  }));
}

// ─── SOS Screen ───────────────────────────────────────────────────────────────

function SOSScreen({ profile }: { profile: UserProfile }) {
  const [coords, setCoords] = useState<GPSCoords | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [sosActive, setSosActive] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [sending, setSending] = useState(false);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => setGpsError("Unable to retrieve location. Check browser location permissions."),
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => { getLocation(); }, [getLocation]);

  const handleSOS = async () => {
    if (sending) return;
    setSosActive(true);
    if (!coords) getLocation();
    if (profile.contacts.length === 0) return;
    setSending(true);
    const locationText = coords
      ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
      : "Location unavailable";
    const messages = profile.contacts.map((c) => ({
      to: c.phone,
      body: `EMERGENCY: ${profile.name || "Someone"} has been in a car crash. Blood group: ${profile.bloodGroup || "Unknown"}. Conditions: ${profile.conditions || "None listed"}. Location: ${locationText}`,
    }));
    try {
      await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    } catch {}
    setSmsSent(true);
    setSending(false);
  };

  if (sosActive) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 pt-10 text-center">
        <div
          className="w-32 h-32 rounded-full bg-primary flex items-center justify-center animate-pulse"
          style={{ boxShadow: "0 0 0 16px #fee2e2" }}
        >
          <AlertTriangle className="w-16 h-16 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-primary">SOS ACTIVE</h2>

        {sending && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader className="w-4 h-4 animate-spin" />
            Sending SMS alerts…
          </div>
        )}
        {smsSent && (
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            SMS sent to {profile.contacts.length} contact{profile.contacts.length !== 1 ? "s" : ""}
          </div>
        )}

        {coords && (
          <div className="w-full bg-card border-2 border-primary rounded-xl p-4 text-left space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-primary">
              Your location — read this aloud
            </div>
            <div className="font-mono text-lg font-bold text-foreground">
              {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
            </div>
            <div className="text-xs text-muted-foreground">
              maps.google.com/?q={coords.lat.toFixed(6)},{coords.lng.toFixed(6)}
            </div>
          </div>
        )}

        <a
          href="tel:112"
          className="w-full bg-primary text-white rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2"
        >
          <Phone className="w-5 h-5" />
          Call 112 / Emergency Services
        </a>

        <button
          onClick={() => { setSosActive(false); setSmsSent(false); }}
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          Cancel SOS
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6 pt-10">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Emergency SOS</h1>
        <p className="text-sm text-muted-foreground">
          Tap to broadcast your location to emergency contacts
        </p>
      </div>

      <button
        onClick={handleSOS}
        className="w-52 h-52 rounded-full bg-primary text-primary-foreground flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform border-8 border-red-100 focus:outline-none"
        style={{ boxShadow: "0 0 0 12px #fee2e2, 0 8px 40px rgba(212,43,43,0.35)" }}
      >
        <AlertTriangle className="w-14 h-14" strokeWidth={2.5} />
        <span className="text-xl font-bold tracking-widest">SOS</span>
      </button>

      {coords && (
        <div className="w-full bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Navigation className="w-4 h-4 text-primary" />
            Your GPS Coordinates
          </div>
          <div className="font-mono text-sm bg-secondary rounded-lg p-3 space-y-1">
            <div>Lat: <span className="font-semibold">{coords.lat.toFixed(6)}</span></div>
            <div>Lng: <span className="font-semibold">{coords.lng.toFixed(6)}</span></div>
            <div className="text-muted-foreground text-xs">±{Math.round(coords.accuracy)}m accuracy</div>
          </div>
          <p className="text-xs text-muted-foreground">
            Read these to emergency services if you cannot share a link.
          </p>
        </div>
      )}

      {gpsError && (
        <div className="w-full bg-accent border border-primary/20 rounded-xl p-3 text-sm text-primary">
          {gpsError}
        </div>
      )}

      {profile.contacts.length === 0 ? (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          No emergency contacts saved. Add contacts in the Profile tab.
        </div>
      ) : (
        <div className="w-full space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Will notify</p>
          {profile.contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <Phone className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.phone}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

// ─── Suggested question flows ─────────────────────────────────────────────────

const INITIAL_SUGGESTIONS = [
  "Someone is unconscious",
  "There is severe bleeding",
  "Someone can't breathe",
  "I think there's a broken bone",
  "Someone is going into shock",
  "I hit my head hard",
];

const FOLLOW_UP_MAP: { keywords: string[]; suggestions: string[] }[] = [
  {
    keywords: ["unconscious", "cpr", "compressions", "rescue breath", "pulse"],
    suggestions: [
      "How do I give rescue breaths?",
      "They started breathing again — what now?",
      "When should I stop CPR?",
      "There are two of us — can we take turns?",
    ],
  },
  {
    keywords: ["bleeding", "pressure", "cloth", "wound", "elevate"],
    suggestions: [
      "The bleeding won't stop after 15 minutes",
      "How do I make a tourniquet?",
      "The wound looks very deep",
      "There is something embedded in the wound",
    ],
  },
  {
    keywords: ["airway", "breathing", "chin", "tilt", "choking"],
    suggestions: [
      "How do I do CPR?",
      "They are choking on something",
      "Their airway seems clear but they're still not breathing",
      "They stopped breathing again",
    ],
  },
  {
    keywords: ["fracture", "bone", "immobilize", "spinal", "neutral position"],
    suggestions: [
      "Can I move them out of the car?",
      "Their neck might be injured",
      "How do I keep them still until help arrives?",
      "The bone is visible through the skin",
    ],
  },
  {
    keywords: ["shock", "legs", "flat", "warm", "loosen"],
    suggestions: [
      "They are losing consciousness",
      "Their skin looks very pale and cold",
      "How long until shock becomes life-threatening?",
      "They are vomiting — what should I do?",
    ],
  },
  {
    keywords: ["head", "concussion", "confusion", "pupil", "scalp"],
    suggestions: [
      "They briefly lost consciousness",
      "They seem very confused and disoriented",
      "There is bleeding from the head",
      "Their pupils look different sizes",
    ],
  },
  {
    keywords: ["burn", "cool", "water", "scald", "cover"],
    suggestions: [
      "The burn is larger than my hand",
      "Their clothing is stuck to the burn",
      "The burn is on their face",
      "I don't have water — what else can I use?",
    ],
  },
  {
    keywords: ["tyre", "tire", "flat", "spare", "jack"],
    suggestions: [
      "I don't have a spare tyre",
      "The car is in a dangerous position on the road",
      "Can I drive slowly on a flat?",
    ],
  },
  {
    keywords: ["overheat", "radiator", "bonnet", "engine", "steam"],
    suggestions: [
      "There is smoke coming from under the bonnet",
      "How long should I wait before opening the bonnet?",
      "The temperature warning light is on",
    ],
  },
];

function getSuggestionsForResponse(botText: string): string[] {
  const lower = botText.toLowerCase();
  for (const { keywords, suggestions } of FOLLOW_UP_MAP) {
    if (keywords.some((k) => lower.includes(k))) return suggestions;
  }
  return INITIAL_SUGGESTIONS;
}

function ChatScreen() {
  const [online, setOnline] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "0",
      role: "bot",
      text: "Hello. I'm CrashGuide. Ask me about first aid or basic car repairs. Toggle **Online** for AI-powered responses (requires backend).",
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, suggestions]);

  const sendText = async (text: string) => {
    if (!text || loading) return;
    setInput("");
    setSuggestions([]);
    setMessages((m) => [...m, { id: Date.now().toString(), role: "user", text }]);
    setLoading(true);

    let botReply = "";
    if (!online) {
      await new Promise((r) => setTimeout(r, 350));
      botReply = offlineAnswer(text);
    } else {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        botReply = data.reply || "No response.";
      } catch {
        botReply = "Online mode unavailable. " + offlineAnswer(text);
      }
    }

    setMessages((m) => [...m, { id: Date.now().toString() + "b", role: "bot", text: botReply }]);
    setSuggestions(getSuggestionsForResponse(botReply));
    setLoading(false);
  };

  const send = () => sendText(input.trim());

  function renderText(text: string) {
    return text.split(/(\*\*[^*]+\*\*)/).map((chunk, i) =>
      chunk.startsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : <span key={i}>{chunk}</span>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <h2 className="font-bold text-base">CrashGuide Chat</h2>
        <button
          onClick={() => setOnline((o) => !o)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors border-2 ${
            online
              ? "bg-green-600 text-white border-green-700"
              : "bg-foreground text-background border-foreground"
          }`}
        >
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {online ? "AI Online" : "Offline"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, idx) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}
            >
              {renderText(m.text)}
            </div>
          </div>
        ))}

        {/* Suggestion chips — shown after last bot message when not loading */}
        {!loading && suggestions.length > 0 && (
          <div className="flex flex-col gap-2.5 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground px-1">
              Quick questions
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendText(s)}
                  className="text-left text-sm font-semibold bg-white text-primary border-2 border-primary rounded-xl px-4 py-3 hover:bg-primary hover:text-white transition-colors active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-border bg-card">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input.trim()); } }}
            placeholder={online ? "Ask anything…" : "Ask about first aid or car issues…"}
            className="flex-1 bg-input-background rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="bg-primary text-white rounded-xl px-4 py-3 disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {online && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Requires backend at <code className="bg-secondary px-1 rounded">/api/chat</code>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Map Screen (vanilla Leaflet, no react-leaflet) ───────────────────────────

function MapScreen() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const poiMarkersRef = useRef<L.Marker[]>([]);

  const [coords, setCoords] = useState<GPSCoords | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<POIKey>>(new Set(["hospital"]));
  const [loadingPOI, setLoadingPOI] = useState(false);
  const [pois, setPois] = useState<POI[]>([]);

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;

    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setCoords(c);
        map.setView([c.lat, c.lng], 14);
        userMarkerRef.current = L.marker([c.lat, c.lng])
          .addTo(map)
          .bindPopup(`<strong>You are here</strong><br/>${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      },
      () => {}
    );

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync POI markers whenever pois or activeCategories change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    pois
      .filter((p) => activeCategories.has(p.category))
      .forEach((poi) => {
        const cat = POI_CATEGORIES.find((c) => c.key === poi.category)!;
        const navUrl = coords
          ? `https://www.openstreetmap.org/directions?from=${coords.lat},${coords.lng}&to=${poi.lat},${poi.lng}`
          : `https://www.openstreetmap.org/?mlat=${poi.lat}&mlon=${poi.lng}`;
        const marker = L.marker([poi.lat, poi.lng], { icon: makePOIIcon(cat.color) })
          .addTo(map)
          .bindPopup(`<strong>${poi.name}</strong><br/><a href="${navUrl}" target="_blank" style="color:#1d4ed8;font-size:12px">Get Directions</a>`);
        poiMarkersRef.current.push(marker);
      });
  }, [pois, activeCategories, coords]);

  const toggleCategory = useCallback(async (key: POIKey) => {
    if (!coords) return;

    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    // If turning on and not yet loaded, fetch
    setActiveCategories((prev) => {
      if (!prev.has(key)) return prev; // was just removed, skip fetch
      const alreadyLoaded = pois.some((p) => p.category === key);
      if (!alreadyLoaded) {
        setLoadingPOI(true);
        fetchPOIs(coords.lat, coords.lng, key)
          .then((results) => setPois((p) => [...p.filter((x) => x.category !== key), ...results]))
          .catch(() => {})
          .finally(() => setLoadingPOI(false));
      }
      return prev;
    });
  }, [coords, pois]);

  // Load initial hospitals when coords arrive
  useEffect(() => {
    if (!coords) return;
    setLoadingPOI(true);
    fetchPOIs(coords.lat, coords.lng, "hospital")
      .then((results) => setPois(results))
      .catch(() => {})
      .finally(() => setLoadingPOI(false));
  }, [coords]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <h2 className="font-bold text-base mb-2">Nearby Services</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {POI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = activeCategories.has(cat.key);
            return (
              <button
                key={cat.key}
                onClick={() => toggleCategory(cat.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors border flex-shrink-0 ${
                  active ? "text-white border-transparent" : "bg-card text-muted-foreground border-border"
                }`}
                style={active ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
          {loadingPOI && <Loader className="w-4 h-4 animate-spin text-muted-foreground self-center ml-1 flex-shrink-0" />}
        </div>
      </div>

      <div className="flex-1 relative">
        <div ref={mapDivRef} className="absolute inset-0" />
        {!coords && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground text-sm bg-background/80 z-10">
            <Loader className="w-5 h-5 animate-spin" />
            Getting your location…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

function ProfileScreen({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (p: UserProfile) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saved, setSaved] = useState(false);
  const [openSection, setOpenSection] = useState<"medical" | "contacts" | null>("medical");

  const update = (patch: Partial<UserProfile>) => {
    const next = { ...profile, ...patch };
    onChange(next);
    saveProfile(next);
  };

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    update({
      contacts: [
        ...profile.contacts,
        { id: Date.now().toString(), name: newName.trim(), phone: newPhone.trim() },
      ],
    });
    setNewName("");
    setNewPhone("");
  };

  const removeContact = (id: string) =>
    update({ contacts: profile.contacts.filter((c) => c.id !== id) });

  const handleSave = () => {
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggle = (s: "medical" | "contacts") => setOpenSection((cur) => (cur === s ? null : s));

  return (
    <div className="overflow-y-auto p-4 space-y-3">
      <h2 className="font-bold text-base">Medical Profile</h2>
      <p className="text-xs text-muted-foreground -mt-1">
        Stored locally on this device. Shared with emergency contacts when SOS is triggered.
      </p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => toggle("medical")}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          Personal &amp; Medical Info
          {openSection === "medical" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {openSection === "medical" && (
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            <div className="space-y-1 pt-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</label>
              <input
                value={profile.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Jane Smith"
                className="w-full bg-input-background rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Blood Group</label>
              <select
                value={profile.bloodGroup}
                onChange={(e) => update({ bloodGroup: e.target.value })}
                className="w-full bg-input-background rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select blood group</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Medical Conditions / Allergies
              </label>
              <textarea
                value={profile.conditions}
                onChange={(e) => update({ conditions: e.target.value })}
                placeholder="e.g. Diabetic, allergic to penicillin, takes blood thinners…"
                rows={3}
                className="w-full bg-input-background rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => toggle("contacts")}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          Emergency Contacts
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-normal">{profile.contacts.length} saved</span>
            {openSection === "contacts" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        {openSection === "contacts" && (
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            <div className="pt-3 space-y-2">
              {profile.contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 bg-secondary rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </div>
                  <button
                    onClick={() => removeContact(c.id)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contact name"
                className="w-full bg-input-background rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+1 234 567 8900 (with country code)"
                className="w-full bg-input-background rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={addContact}
                disabled={!newName.trim() || !newPhone.trim()}
                className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground border border-border rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Contact
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        className="w-full bg-primary text-white rounded-xl py-3.5 font-semibold text-sm flex items-center justify-center gap-2"
      >
        {saved && <CheckCircle className="w-4 h-4" />}
        {saved ? "Saved!" : "Save Profile"}
      </button>

      <p className="text-xs text-center text-muted-foreground pb-4">
        SMS alerts via Twilio — configure your backend with{" "}
        <code className="bg-secondary px-1 rounded">TWILIO_SID</code>,{" "}
        <code className="bg-secondary px-1 rounded">TWILIO_TOKEN</code>, and{" "}
        <code className="bg-secondary px-1 rounded">TWILIO_FROM</code>.
      </p>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>("sos");
  const [profile, setProfile] = useState<UserProfile>(loadProfile);

  const tabs: { key: Tab; label: string; Icon: any }[] = [
    { key: "sos",     label: "SOS",     Icon: AlertTriangle  },
    { key: "chat",    label: "Guide",   Icon: MessageSquare  },
    { key: "map",     label: "Map",     Icon: Map            },
    { key: "profile", label: "Profile", Icon: User           },
  ];

  return (
    <div
      className="flex flex-col bg-background"
      style={{ height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
          <AlertTriangle className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-sm tracking-tight">CrashGuard</span>
        {profile.name && (
          <span className="ml-auto text-xs text-muted-foreground">{profile.name}</span>
        )}
        {profile.bloodGroup && (
          <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {profile.bloodGroup}
          </span>
        )}
      </div>

      {/* Content — keep all tabs mounted so map doesn't re-init on tab switch */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 overflow-y-auto ${tab !== "sos" ? "hidden" : ""}`}>
          <SOSScreen profile={profile} />
        </div>
        <div className={`absolute inset-0 flex flex-col ${tab !== "chat" ? "hidden" : ""}`}>
          <ChatScreen />
        </div>
        <div className={`absolute inset-0 flex flex-col ${tab !== "map" ? "hidden" : ""}`}>
          <MapScreen />
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${tab !== "profile" ? "hidden" : ""}`}>
          <ProfileScreen profile={profile} onChange={setProfile} />
        </div>
      </div>

      {/* Bottom nav */}
      <div className="border-t border-border bg-card flex-shrink-0">
        <div className="flex">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                tab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={tab === key ? 2.5 : 1.75} />
              <span className="text-xs font-medium">{label}</span>
              {tab === key && <span className="w-1 h-1 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
