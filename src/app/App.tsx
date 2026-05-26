import { useEffect, useRef, useState, useCallback } from "react";
import {
  Phone, MessageSquare, MapPin, Users, Settings,
  X, Send, Wifi, WifiOff, Plus, Trash2, Loader,
  CheckCircle, RefreshCw, Hospital, Wrench, Truck,
  ChevronRight, Navigation2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact { id: string; name: string; phone: string; }

interface Profile {
  bloodGroup: string;
  conditions: string;
  allergies: string;
  contacts: Contact[];
  emergencyNumber: string;
}

interface Coords { lat: number; lng: number; accuracy?: number; }

interface POI {
  id: number;
  name: string;
  lat: number;
  lng: number;
  phone?: string;
  category: "hospital" | "repair" | "tow";
  distance: number;
}

interface Msg { id: string; role: "user" | "bot"; text: string; }

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORE_KEY = "crashsafe_v2";

function loadProfile(): Profile {
  try { const r = localStorage.getItem(STORE_KEY); if (r) return JSON.parse(r); } catch {}
  return { bloodGroup: "", conditions: "", allergies: "", contacts: [], emergencyNumber: "112" };
}

function saveProfile(p: Profile) { localStorage.setItem(STORE_KEY, JSON.stringify(p)); }

// ─── Utilities ────────────────────────────────────────────────────────────────

// Haversine formula — great-circle distance between two GPS coordinates
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtKm(km: number) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`; }

function fmtCoords(c: Coords) {
  return `${Math.abs(c.lat).toFixed(5)}°${c.lat >= 0 ? "N" : "S"} ${Math.abs(c.lng).toFixed(5)}°${c.lng >= 0 ? "E" : "W"}`;
}

// Nominatim reverse geocoding — area name from coordinates (free, no key)
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const d = await res.json();
    const a = d.address || {};
    const area = a.suburb || a.neighbourhood || a.city_district || a.city || a.town || a.village || "";
    const state = a.state || "";
    return [area, state].filter(Boolean).join(", ") || "Location acquired";
  } catch { return ""; }
}

// Directions URL — Apple Maps on iOS, Google Maps everywhere else
function dirUrl(lat: number, lng: number, uLat?: number, uLng?: number) {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return `maps://maps.apple.com/?daddr=${lat},${lng}`;
  const origin = uLat != null ? `&origin=${uLat},${uLng}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${origin}`;
}

// SMS URI — separator differs between iOS and Android
function smsUri(phone: string, body: string) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `sms:${phone}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

// ─── POI fetching (Overpass API — no map rendered, just data) ─────────────────

async function fetchPOIs(lat: number, lng: number): Promise<POI[]> {
  const q = `[out:json][timeout:15];(
    node[amenity=hospital](around:5000,${lat},${lng});
    way[amenity=hospital](around:5000,${lat},${lng});
    node[shop=car_repair](around:5000,${lat},${lng});
    node[amenity=car_rental](around:5000,${lat},${lng});
  );out center 40;`;
  const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
  const json = await res.json();
  return (json.elements || [])
    .map((el: any) => {
      const eLat = el.lat ?? el.center?.lat, eLng = el.lon ?? el.center?.lon;
      if (!eLat || !eLng) return null;
      const hosp = el.tags?.amenity === "hospital";
      const tow = el.tags?.amenity === "car_rental";
      const cat: POI["category"] = hosp ? "hospital" : tow ? "tow" : "repair";
      return {
        id: el.id,
        name: el.tags?.name || (hosp ? "Hospital" : tow ? "Car Rental / Tow" : "Car Repair"),
        lat: eLat, lng: eLng,
        phone: el.tags?.phone || el.tags?.["contact:phone"] || undefined,
        category: cat,
        distance: haversineKm(lat, lng, eLat, eLng),
      };
    })
    .filter(Boolean)
    .sort((a: POI, b: POI) => a.distance - b.distance);
}

// ─── Offline manuals ──────────────────────────────────────────────────────────

const FIRST_AID_MANUAL = [
  {
    title: "Unconscious Person & CPR",
    keywords: ["unconscious","unresponsive","not breathing","no pulse","cpr","cardiac","heart","compressions","passed out","fainted","wake up","won't wake"],
    content: "**Check response:** Tap shoulders and shout. No response — call 112 immediately.\n\n**Open airway:** Tilt head back, lift chin. Check for breathing (look/listen/feel) for 10 seconds.\n\n**Start CPR if not breathing:**\n• Heel of hand on centre of chest (lower breastbone)\n• Press 5–6 cm deep at 100–120/min\n• 30 compressions → 2 rescue breaths (tilt head, pinch nose, 1-second breath)\n• Continue until EMS arrives or person recovers\n\n**Recovery position:** If breathing but unconscious — roll onto side to prevent choking.",
  },
  {
    title: "Severe Bleeding",
    keywords: ["bleeding","blood","wound","cut","haemorrhage","tourniquet","laceration","gash","gushing"],
    content: "**Direct pressure:** Use the cleanest cloth available. Press firmly — do NOT remove it. Layer more on top if soaked through.\n\n**Elevate the limb** above heart level.\n\n**Hold pressure** for 10–15 minutes without releasing.\n\n**Tourniquet** (life-threatening limb bleed only): Apply 5–7 cm above wound. Tighten until bleeding stops. Write the time on the skin. Do NOT remove.\n\n**Do NOT:** Remove embedded objects. Press on skull fractures.",
  },
  {
    title: "Breathing / Airway",
    keywords: ["breathing","breath","airway","choking","choke","asphyxia","inhale","gasping","wheezing","can't breathe"],
    content: "**Choking (conscious):** 5 firm back blows between shoulder blades, then 5 abdominal thrusts. Alternate until clear or they lose consciousness.\n\n**Choking (unconscious):** Begin CPR. Each time you open the airway, look for the object and remove it if visible.\n\n**Breathing difficulty (not choking):** Keep upright in the position they find easiest. Loosen collar/tight clothing. Call 112. Do NOT lay flat unless unconscious.",
  },
  {
    title: "Fractures & Broken Bones",
    keywords: ["fracture","broken","bone","break","deformed","limb","leg","arm","splint"],
    content: "**Do NOT straighten the limb.** Support it in the position found with padding (rolled clothing).\n\n**Arm fracture:** Improvise a sling with a shirt or scarf.\n\n**Leg fracture:** Pad between legs and loosely tie together.\n\n**Open fracture (bone visible):** Cover loosely with clean cloth — do NOT push the bone back. Seek emergency care immediately.\n\n**Check circulation:** Press a fingertip below the injury — pink should return within 2 seconds.",
  },
  {
    title: "Spinal / Neck Injury",
    keywords: ["spine","spinal","neck","cervical","paralysis","numbness","tingling","back injury","can't feel","can't move"],
    content: "**Do NOT move the person** unless there is immediate danger (fire, water, oncoming traffic).\n\n**Hold the head still** in the position found — both hands on either side. Do not twist or flex the neck.\n\n**If they must be moved:** Log-roll with 3+ people, keeping head/spine/legs in one line.\n\n**Signs:** Neck or back pain, numbness/tingling in limbs, inability to move, loss of bladder/bowel control.\n\n**Airway always first:** If not breathing, CPR takes priority over spinal precaution.",
  },
  {
    title: "Shock",
    keywords: ["shock","pale","cold","clammy","faint","dizzy","weak pulse","low blood pressure","shaking","trembling"],
    content: "**Signs:** Pale cold clammy skin · Rapid weak pulse · Fast shallow breathing · Confusion or anxiety.\n\n**Treatment:**\n1. Lay the person flat\n2. Raise legs 20–30 cm (unless neck, spinal, chest, or leg injury)\n3. Cover with a jacket or blanket — keep warm\n4. Do NOT give food or drink\n5. Loosen tight clothing (collar, belt)\n6. Call 112 — stay with them, monitor breathing",
  },
  {
    title: "Head Injury",
    keywords: ["head","concussion","skull","hit head","brain","confused","vomiting","seizure","pupils","headache","temple"],
    content: "**Call 112 immediately if any of these:**\n• Loss of consciousness (even briefly)\n• Repeated vomiting · Seizure\n• Unequal pupil sizes · Clear fluid from nose or ears\n• Severe or worsening headache · Confusion or aggression\n\n**Care:** Keep still and calm. Gentle pressure on scalp wounds with a clean cloth — do NOT press on a suspected skull fracture. Do NOT give aspirin or ibuprofen.",
  },
  {
    title: "Burns",
    keywords: ["burn","burned","scald","hot","blister","chemical","fire burn","skin burn"],
    content: "**Cool immediately:** Run cool (not cold, not ice) water over the burn for 20 minutes. Start within 3 hours.\n\n**Remove:** Jewellery and loose clothing near the burn (not if stuck to skin).\n\n**Cover:** Loosely with cling film or a clean non-fluffy material.\n\n**Do NOT:** Butter, toothpaste, oil, ice, creams, or cotton wool. Do not break blisters.\n\n**Emergency care for:** Burns larger than 3 cm · Face/hands/feet/joints · Chemical or electrical burns · White or charred skin.",
  },
];

const CAR_REPAIR_MANUAL = [
  {
    title: "Flat Tyre",
    keywords: ["flat","tyre","tire","puncture","blowout","wheel","spare"],
    content: "**If tyre blows while driving:** Grip wheel firmly. Do NOT brake hard. Ease off accelerator, steer calmly to the shoulder.\n\n**Safe tyre change:**\n1. Hazard lights on — move fully off the road — apply handbrake\n2. Loosen wheel nuts BEFORE jacking (half-turn, star pattern)\n3. Jack under the designated lift point (door sill sticker)\n4. Fit spare, hand-tighten nuts in star pattern\n5. Lower jack, fully tighten nuts\n\nSpare tyres: max 80 km/h — get the original repaired soon.",
  },
  {
    title: "Engine Overheating",
    keywords: ["overheat","overheating","radiator","steam","temperature","engine hot","temp light","coolant"],
    content: "**Warning signs:** Temperature gauge in red, steam from bonnet, burning smell.\n\n1. Turn off the A/C\n2. On a highway — switch on the heater briefly to draw heat away from the engine\n3. Pull over safely and switch off the engine\n4. Do NOT open the bonnet while steam is visible — wait 30 minutes\n5. NEVER open the radiator cap on a hot engine (risk of scalding)\n6. Once cool — check coolant. Add water if empty (temporary fix)\n7. Call a tow truck — do not drive until repaired.",
  },
  {
    title: "Vehicle Fire",
    keywords: ["fire","car fire","smoke","flames","burning","engine fire","bonnet fire"],
    content: "**Act immediately — every second counts:**\n1. Pull over and switch off engine\n2. Everyone exits — no belongings\n3. Move 100+ metres away (fuel tank can explode)\n4. Call emergency services\n5. Do NOT open the bonnet if you suspect an engine fire\n6. Small accessible fire only: extinguisher aimed at the base — if not out in 10 seconds, retreat\n\n**Never re-enter a burning vehicle.**",
  },
  {
    title: "Dead Battery / Won't Start",
    keywords: ["battery","dead battery","won't start","not starting","jump start","jump leads","jumper","flat battery"],
    content: "**Jump-start steps:**\n1. Position the working car close — cars must NOT touch each other\n2. RED cable: dead battery (+) → working battery (+)\n3. BLACK cable: working battery (-) → unpainted metal on the dead car (not the dead battery terminal)\n4. Start working car, run for 2–3 minutes\n5. Start the dead car\n6. Remove cables in reverse order\n7. Drive the recovered car for 30+ minutes to recharge.",
  },
  {
    title: "Fuel Leak",
    keywords: ["fuel","petrol","gas","diesel","leak","smell fuel","fuel smell","dripping fuel"],
    content: "**Fuel leaks risk fire and explosion.**\n\n1. Switch off engine immediately\n2. No smoking — no open flames — no phone near the fuel\n3. Disconnect the battery if you can do so safely\n4. Everyone exits and moves 50+ metres upwind\n5. Call emergency services for any significant leak\n6. Do NOT drive the vehicle\n7. Call a tow truck",
  },
  {
    title: "After a Crash — Post-Impact",
    keywords: ["after crash","post crash","airbag","deployed","collision","accident","impact","just crashed"],
    content: "**Before exiting the vehicle:**\n• Switch off engine · Turn on hazard lights\n• Check all passengers for injuries before deciding to move anyone\n\n**Airbag powder:** Irritating but not toxic — brush off skin, wash with soap when possible.\n\n**Do NOT move injured passengers** unless there is an immediate threat (fire, water, oncoming traffic).\n\n**Undeployed airbags** in a damaged car can still deploy — avoid impact to dashboard and steering column.",
  },
];

function offlineSearch(query: string): string {
  const lower = query.toLowerCase();
  const score = (kws: string[]) => kws.reduce((n, k) => n + (lower.includes(k) ? 1 : 0), 0);

  const all = [
    ...FIRST_AID_MANUAL.map(s => ({ ...s, tag: "First Aid" })),
    ...CAR_REPAIR_MANUAL.map(s => ({ ...s, tag: "Car & Road" })),
  ];

  const ranked = all
    .map(s => ({ ...s, score: score(s.keywords) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return "No specific match found. **For emergencies, call 112 immediately.**\n\nI can help with: CPR, unconscious person, bleeding, breathing, fractures, spinal injury, shock, head injury, burns, flat tyre, overheating, vehicle fire, dead battery, fuel leak, post-crash steps.";
  }

  const top = ranked[0];
  let result = `**${top.tag}: ${top.title}**\n\n${top.content}`;
  if (ranked[1] && ranked[1].score >= top.score - 1 && ranked[1].tag !== top.tag) {
    result += `\n\n---\n**Also relevant — ${ranked[1].tag}: ${ranked[1].title}**\n\n${ranked[1].content}`;
  }
  return result;
}

// ─── Chat suggestion flows ────────────────────────────────────────────────────

const INITIAL_SUGGESTIONS = [
  "Someone is unconscious",
  "There is severe bleeding",
  "Someone can't breathe",
  "I think there's a broken bone",
  "Someone is going into shock",
  "I hit my head hard",
];

const FOLLOW_UPS: { keywords: string[]; suggestions: string[] }[] = [
  {
    keywords: ["cpr", "compressions", "unconscious", "rescue breath", "not breathing"],
    suggestions: ["How do I give rescue breaths?", "They started breathing again — what now?", "When should I stop CPR?"],
  },
  {
    keywords: ["bleeding", "pressure", "tourniquet", "wound", "cloth"],
    suggestions: ["The bleeding won't stop after 15 minutes", "How do I make a tourniquet?", "There is something embedded in the wound"],
  },
  {
    keywords: ["airway", "breathing", "chin", "choking", "choke"],
    suggestions: ["How do I do CPR?", "They are choking on something solid", "They stopped breathing again"],
  },
  {
    keywords: ["fracture", "bone", "sling", "splint", "immobilise"],
    suggestions: ["Can I move them out of the car?", "Their neck might be injured", "The bone is visible through the skin"],
  },
  {
    keywords: ["shock", "legs", "flat", "warm", "clammy", "pale"],
    suggestions: ["They are losing consciousness", "Their skin is pale and cold", "They are vomiting — what should I do?"],
  },
  {
    keywords: ["head", "concussion", "pupil", "scalp", "skull"],
    suggestions: ["They briefly lost consciousness", "They seem confused and disoriented", "There is bleeding from the head wound"],
  },
  {
    keywords: ["burn", "cool", "water", "blister", "scald"],
    suggestions: ["The burn is larger than my hand", "Their clothing is stuck to the burned skin", "I don't have running water"],
  },
  {
    keywords: ["flat", "tyre", "tire", "spare", "jack", "blowout"],
    suggestions: ["I don't have a spare tyre", "The car is still on the road", "Can I drive slowly on a flat?"],
  },
  {
    keywords: ["overheat", "radiator", "bonnet", "steam", "coolant"],
    suggestions: ["There is smoke from under the bonnet", "The temperature warning light came on", "How long should I wait before opening the bonnet?"],
  },
];

function getSuggestions(botText: string): string[] {
  const lower = botText.toLowerCase();
  for (const { keywords, suggestions } of FOLLOW_UPS) {
    if (keywords.some(k => lower.includes(k))) return suggestions;
  }
  return INITIAL_SUGGESTIONS;
}

// ─── BottomSheet ──────────────────────────────────────────────────────────────

function BottomSheet({
  open, onClose, title, children, maxHeight = "85dvh",
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; maxHeight?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full bg-white rounded-t-3xl flex flex-col shadow-2xl"
        style={{ maxHeight }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-lg text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Chat overlay (full-screen) ───────────────────────────────────────────────

function ChatOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [online, setOnline] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "0",
      role: "bot",
      text: "Hello. I'm CrashGuide.\n\nAsk me about first aid or car repairs. **Offline mode** uses built-in manuals. Toggle **AI Online** to use the AI assistant (requires your backend at /api/chat).",
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
    setMessages(m => [...m, { id: Date.now().toString(), role: "user", text }]);
    setLoading(true);

    let reply = "";
    if (!online) {
      await new Promise(r => setTimeout(r, 280));
      reply = offlineSearch(text);
    } else {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        reply = data.reply || "No response received.";
      } catch {
        reply = "Online mode unavailable — using offline manual.\n\n" + offlineSearch(text);
      }
    }

    setMessages(m => [...m, { id: Date.now().toString() + "b", role: "bot", text: reply }]);
    setSuggestions(getSuggestions(reply));
    setLoading(false);
  };

  function renderText(text: string) {
    return text.split(/(\*\*[^*]+\*\*)/).map((chunk, i) =>
      chunk.startsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : <span key={i}>{chunk}</span>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
        <button
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 flex-shrink-0"
        >
          <X className="w-5 h-5 text-gray-700" />
        </button>
        <h2 className="font-bold text-base flex-1 text-gray-900">First Aid &amp; Repair Guide</h2>
        <button
          onClick={() => setOnline(o => !o)}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold border-2 transition-colors flex-shrink-0 ${
            online
              ? "bg-green-600 text-white border-green-700"
              : "bg-gray-900 text-white border-gray-900"
          }`}
        >
          {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          {online ? "AI Online" : "Offline"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-[#d42b2b] text-white rounded-br-sm"
                  : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm"
              }`}
            >
              {renderText(m.text)}
            </div>
          </div>
        ))}

        {!loading && suggestions.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Quick questions</p>
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => sendText(s)}
                className="w-full text-left text-sm font-semibold bg-white text-[#d42b2b] border-2 border-[#d42b2b] rounded-xl px-4 py-3.5 min-h-[56px] hover:bg-[#d42b2b] hover:text-white transition-colors active:scale-[0.98] shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1.5 items-center">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-3 border-t border-gray-100 bg-white flex-shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input.trim()); } }}
            placeholder="Describe what's happening…"
            className="flex-1 bg-gray-100 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 min-h-[56px]"
          />
          <button
            onClick={() => sendText(input.trim())}
            disabled={!input.trim() || loading}
            className="bg-[#d42b2b] text-white rounded-xl px-4 disabled:opacity-40 min-h-[56px] min-w-[56px] flex items-center justify-center"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Nearby Services sheet ────────────────────────────────────────────────────

type POICat = "hospital" | "repair" | "tow";

const POI_FILTERS: { key: POICat; label: string; Icon: typeof Hospital; color: string }[] = [
  { key: "hospital", label: "Hospitals",   Icon: Hospital, color: "#d42b2b" },
  { key: "repair",   label: "Repair",      Icon: Wrench,   color: "#d97706" },
  { key: "tow",      label: "Tow / Rental",Icon: Truck,    color: "#059669" },
];

function NearbySheet({ open, onClose, coords }: { open: boolean; onClose: () => void; coords: Coords | null }) {
  const [pois, setPois] = useState<POI[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Set<POICat>>(new Set(["hospital", "repair", "tow"]));

  useEffect(() => {
    if (!open || !coords || pois.length > 0) return;
    setFetching(true);
    setError("");
    fetchPOIs(coords.lat, coords.lng)
      .then(setPois)
      .catch(() => setError("Could not load services. Check your internet connection."))
      .finally(() => setFetching(false));
  }, [open, coords]);

  const toggle = (cat: POICat) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const visible = pois.filter(p => active.has(p.category));

  return (
    <BottomSheet open={open} onClose={onClose} title="Nearby Services" maxHeight="88dvh">
      {/* Filter chips */}
      <div className="flex gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
        {POI_FILTERS.map(({ key, label, Icon, color }) => {
          const on = active.has(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold border-2 transition-colors min-h-[40px]"
              style={on ? { backgroundColor: color, borderColor: color, color: "white" } : { borderColor: "#e5e7eb", color: "#6b7280", backgroundColor: "white" }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {fetching && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
            <Loader className="w-6 h-6 animate-spin text-[#d42b2b]" />
            <p className="text-sm">Finding nearby services…</p>
          </div>
        )}
        {error && <p className="text-center text-red-600 text-sm px-8 py-10">{error}</p>}
        {!fetching && !error && visible.length === 0 && (
          <p className="text-center text-gray-400 text-sm px-8 py-10">
            {pois.length === 0 ? "No services found within 5 km." : "No services match the selected filters."}
          </p>
        )}
        <div className="divide-y divide-gray-100">
          {visible.map(poi => {
            const cat = POI_FILTERS.find(f => f.key === poi.category)!;
            const CatIcon = cat.Icon;
            return (
              <div key={poi.id} className="px-6 py-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: cat.color + "18" }}
                  >
                    <CatIcon className="w-5 h-5" style={{ color: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 leading-snug">{poi.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 font-medium">{fmtKm(poi.distance)} away</p>
                    {poi.phone && <p className="text-xs text-gray-500 mt-0.5">{poi.phone}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {poi.phone ? (
                    <a
                      href={`tel:${poi.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#d42b2b] text-white rounded-xl py-3.5 text-sm font-bold min-h-[56px]"
                    >
                      <Phone className="w-4 h-4" />
                      Call
                    </a>
                  ) : (
                    <div className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-400 rounded-xl py-3.5 text-sm font-medium min-h-[56px]">
                      No phone
                    </div>
                  )}
                  <a
                    href={dirUrl(poi.lat, poi.lng, coords?.lat, coords?.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3.5 text-sm font-bold min-h-[56px]"
                  >
                    <Navigation2 className="w-4 h-4" />
                    Directions
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── Emergency Contacts sheet ─────────────────────────────────────────────────

function ContactsSheet({
  open, onClose, contacts, coords,
}: {
  open: boolean; onClose: () => void; contacts: Contact[]; coords: Coords | null;
}) {
  const [sent, setSent] = useState<Set<string>>(new Set());

  const smsBody = coords
    ? `EMERGENCY: I've been in a car crash. My location: https://maps.google.com/?q=${coords.lat},${coords.lng}\nGPS: ${fmtCoords(coords)}\nPlease call me or emergency services.`
    : "EMERGENCY: I've been in a car crash. Please call me or emergency services immediately.";

  const markSent = (id: string) => {
    setSent(prev => new Set([...prev, id]));
    setTimeout(() => setSent(prev => { const n = new Set(prev); n.delete(id); return n; }), 3000);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Emergency Contacts">
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Users className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-600 font-medium text-sm">No emergency contacts saved</p>
            <p className="text-gray-400 text-xs mt-1">Add contacts in Settings</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contacts.map(c => (
              <div key={c.id} className="px-6 py-5 space-y-3">
                <div>
                  <p className="font-bold text-base text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`tel:${c.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#d42b2b] text-white rounded-xl py-4 text-sm font-bold min-h-[56px]"
                  >
                    <Phone className="w-4 h-4" />
                    Call
                  </a>
                  <a
                    href={smsUri(c.phone, smsBody)}
                    onClick={() => markSent(c.id)}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold min-h-[56px] transition-colors ${
                      sent.has(c.id) ? "bg-green-600 text-white" : "bg-gray-900 text-white"
                    }`}
                  >
                    {sent.has(c.id) ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {sent.has(c.id) ? "Sent!" : "Send SMS"}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* SMS content preview */}
        {contacts.length > 0 && (
          <div className="px-6 pb-6 pt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">SMS preview</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-500 leading-relaxed">
              {smsBody}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ─── Settings screen ──────────────────────────────────────────────────────────

const EMERGENCY_PRESETS = [
  { label: "112 — International / EU / Malaysia / India", value: "112" },
  { label: "911 — USA / Canada / Mexico", value: "911" },
  { label: "999 — UK / Hong Kong / Bangladesh", value: "999" },
  { label: "000 — Australia", value: "000" },
  { label: "111 — New Zealand", value: "111" },
  { label: "Custom number…", value: "__custom__" },
];

function SettingsScreen({ profile, onSave, onClose }: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onClose: () => void;
}) {
  const isPreset = EMERGENCY_PRESETS.some(p => p.value === profile.emergencyNumber && p.value !== "__custom__");
  const [local, setLocal] = useState<Profile>(profile);
  const [numMode, setNumMode] = useState(isPreset ? profile.emergencyNumber : "__custom__");
  const [customNum, setCustomNum] = useState(isPreset ? "" : profile.emergencyNumber);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<Profile>) => setLocal(prev => ({ ...prev, ...p }));

  const handleSave = () => {
    const num = numMode === "__custom__" ? customNum.trim() : numMode;
    const final: Profile = { ...local, emergencyNumber: num || "112" };
    onSave(final);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    patch({ contacts: [...local.contacts, { id: Date.now().toString(), name: newName.trim(), phone: newPhone.trim() }] });
    setNewName(""); setNewPhone("");
  };

  const removeContact = (id: string) => patch({ contacts: local.contacts.filter(c => c.id !== id) });

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="flex items-center gap-3 px-6 pt-12 pb-4 bg-white border-b border-gray-100 flex-shrink-0">
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 flex-shrink-0">
          <X className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="font-bold text-xl flex-1 text-gray-900">Settings</h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 bg-[#d42b2b] text-white rounded-xl px-5 py-2.5 text-sm font-bold min-h-[44px]"
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : null}
          {saved ? "Saved!" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        {/* Emergency number */}
        <div className="mt-6 bg-white border-y border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Emergency Call Number</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            <select
              value={numMode}
              onChange={e => setNumMode(e.target.value)}
              className="w-full bg-gray-100 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 min-h-[56px] appearance-none"
            >
              {EMERGENCY_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {numMode === "__custom__" && (
              <input
                value={customNum}
                onChange={e => setCustomNum(e.target.value)}
                placeholder="e.g. 995"
                className="w-full bg-gray-100 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 min-h-[56px]"
              />
            )}
          </div>
        </div>

        {/* Medical info */}
        <div className="mt-6 bg-white border-y border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Medical Information</p>
            <p className="text-xs text-gray-400 mt-0.5">Shared with emergency contacts in SMS alerts</p>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Blood Group</label>
              <select
                value={local.bloodGroup}
                onChange={e => patch({ bloodGroup: e.target.value })}
                className="w-full bg-gray-100 rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 mt-2 min-h-[56px] appearance-none"
              >
                <option value="">Not set</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Medical Conditions</label>
              <textarea
                value={local.conditions}
                onChange={e => patch({ conditions: e.target.value })}
                placeholder="e.g. Diabetic, hypertension, epilepsy…"
                rows={3}
                className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 resize-none mt-2"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Allergies</label>
              <textarea
                value={local.allergies}
                onChange={e => patch({ allergies: e.target.value })}
                placeholder="e.g. Penicillin, NSAIDs, latex, shellfish…"
                rows={2}
                className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 resize-none mt-2"
              />
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="mt-6 bg-white border-y border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Emergency Contacts</p>
          </div>
          <div className="divide-y divide-gray-50">
            {local.contacts.map(c => (
              <div key={c.id} className="flex items-center px-6 py-4 gap-3 min-h-[64px]">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                </div>
                <button
                  onClick={() => removeContact(c.id)}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-red-50 text-red-500 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 space-y-3 border-t border-gray-50">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Contact name"
              className="w-full bg-gray-100 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 min-h-[56px]"
            />
            <input
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="+60 12 345 6789 (include country code)"
              className="w-full bg-gray-100 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d42b2b]/30 min-h-[56px]"
            />
            <button
              onClick={addContact}
              disabled={!newName.trim() || !newPhone.trim()}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3.5 text-sm font-bold min-h-[56px] disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function MainScreen({
  profile, coords, areaName, gpsLoading,
  onRefreshGPS, onOpenChat, onOpenNearby, onOpenContacts, onOpenSettings,
}: {
  profile: Profile;
  coords: Coords | null;
  areaName: string;
  gpsLoading: boolean;
  onRefreshGPS: () => void;
  onOpenChat: () => void;
  onOpenNearby: () => void;
  onOpenContacts: () => void;
  onOpenSettings: () => void;
}) {
  const medInfo = [profile.conditions, profile.allergies].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 pt-12 pb-5 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black tracking-tight text-gray-900">CrashSafe</h1>
            {/* Medical summary */}
            {(profile.bloodGroup || medInfo) ? (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {profile.bloodGroup && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#d42b2b] bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                    🩸 {profile.bloodGroup}
                  </span>
                )}
                {medInfo && (
                  <span className="text-xs text-gray-500 leading-relaxed">{medInfo}</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-600 font-semibold mt-1.5">
                ⚠️ Add medical info in Settings
              </p>
            )}
          </div>
          <button
            onClick={onOpenSettings}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-gray-100 flex-shrink-0"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* GPS location */}
        <div className="mt-4 flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-[#d42b2b] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            {gpsLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Locating…
              </div>
            ) : coords ? (
              <>
                {areaName && <p className="text-sm font-semibold text-gray-800 truncate">{areaName}</p>}
                <p className="text-xs text-gray-400 font-mono mt-0.5">{fmtCoords(coords)}</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">Location unavailable — tap refresh</p>
            )}
          </div>
          <button
            onClick={onRefreshGPS}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${gpsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {/* Call emergency number — primary, dominant */}
        <a
          href={`tel:${profile.emergencyNumber}`}
          className="flex items-center justify-center gap-4 w-full bg-[#d42b2b] text-white rounded-2xl min-h-[88px] font-black text-2xl shadow-lg active:scale-[0.98] transition-transform select-none"
          style={{ boxShadow: "0 4px 24px rgba(212,43,43,0.30)" }}
        >
          <Phone className="w-8 h-8" strokeWidth={2.5} />
          Call {profile.emergencyNumber}
        </a>

        {/* 2-column row */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onOpenChat}
            className="flex flex-col items-center justify-center gap-2.5 bg-[#1e293b] text-white rounded-2xl min-h-[108px] px-4 active:scale-[0.97] transition-transform"
          >
            <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-center leading-tight">First Aid Guide</span>
          </button>
          <button
            onClick={onOpenNearby}
            className="flex flex-col items-center justify-center gap-2.5 bg-[#1e3a5f] text-white rounded-2xl min-h-[108px] px-4 active:scale-[0.97] transition-transform"
          >
            <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-center leading-tight">Nearby Services</span>
          </button>
        </div>

        {/* Emergency contacts — full width */}
        <button
          onClick={onOpenContacts}
          className="flex items-center gap-4 w-full bg-[#14532d] text-white rounded-2xl px-6 min-h-[72px] active:scale-[0.98] transition-transform"
        >
          <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-base leading-tight">Emergency Contacts</p>
            <p className="text-xs text-white/60 mt-0.5">
              {profile.contacts.length > 0
                ? `${profile.contacts.length} contact${profile.contacts.length !== 1 ? "s" : ""} — tap to call or SMS`
                : "No contacts saved"}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [areaName, setAreaName] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sheet, setSheet] = useState<"chat" | "nearby" | "contacts" | null>(null);

  const fetchGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setCoords(c);
        reverseGeocode(c.lat, c.lng).then(setAreaName);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => { fetchGPS(); }, [fetchGPS]);

  const handleProfileSave = (p: Profile) => { setProfile(p); saveProfile(p); };

  return (
    <div
      className="bg-gray-50 overflow-hidden relative"
      style={{ height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <MainScreen
        profile={profile}
        coords={coords}
        areaName={areaName}
        gpsLoading={gpsLoading}
        onRefreshGPS={fetchGPS}
        onOpenChat={() => setSheet("chat")}
        onOpenNearby={() => setSheet("nearby")}
        onOpenContacts={() => setSheet("contacts")}
        onOpenSettings={() => setSettings(true)}
      />

      <ChatOverlay open={sheet === "chat"} onClose={() => setSheet(null)} />
      <NearbySheet open={sheet === "nearby"} onClose={() => setSheet(null)} coords={coords} />
      <ContactsSheet open={sheet === "contacts"} onClose={() => setSheet(null)} contacts={profile.contacts} coords={coords} />

      {settings && (
        <SettingsScreen
          profile={profile}
          onSave={p => { handleProfileSave(p); }}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}
