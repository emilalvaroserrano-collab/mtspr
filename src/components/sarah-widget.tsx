import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Send, X } from "lucide-react";
import { askSarah, cancelSarahAction, confirmSarahAction } from "@/lib/portal/sarah";
import { startSarahCall } from "@/lib/portal/livekit-call";
import { useShopToken } from "@/lib/portal/shop-session";
import { addToCart } from "@/lib/portal/store-cart";

let sarahLive = false;
let voiceLevels: number[] = [];
const sarahLiveListeners = new Set<(live: boolean) => void>();
const voiceListeners = new Set<(levels: number[]) => void>();

function setSarahLive(next: boolean) {
  sarahLive = next;
  sarahLiveListeners.forEach((listener) => listener(next));
}

function setVoiceLevels(next: number[]) {
  voiceLevels = next;
  voiceListeners.forEach((listener) => listener(next));
}

function useSarahLive() {
  const [live, setLive] = useState(sarahLive);
  useEffect(() => {
    sarahLiveListeners.add(setLive);
    setLive(sarahLive);
    return () => {
      sarahLiveListeners.delete(setLive);
    };
  }, []);
  return live;
}

function useVoiceLevels() {
  const [levels, setLevels] = useState(voiceLevels);
  useEffect(() => {
    voiceListeners.add(setLevels);
    setLevels(voiceLevels);
    return () => {
      voiceListeners.delete(setLevels);
    };
  }, []);
  return levels;
}

function AgentMark({ className = "size-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M16 27a16 16 0 0 1 32 0" fill="none" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" />
      <rect x="7" y="23" width="10" height="15" rx="3" fill="currentColor" />
      <rect x="47" y="23" width="10" height="15" rx="3" fill="currentColor" />
      <path d="M32 16c8.4 0 15 6.4 15 14.4 0 6.2-3.4 10.4-8.2 13.2L32 54l-6.8-10.4C20.4 40.8 17 36.6 17 30.4 17 22.4 23.6 16 32 16z" fill="currentColor" />
      <circle cx="25.5" cy="31" r="1.8" fill="#e5f6f7" />
      <circle cx="32" cy="31" r="1.8" fill="#e5f6f7" />
      <circle cx="38.5" cy="31" r="1.8" fill="#e5f6f7" />
      <path d="M52 38c5 2 8 6 7 12" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="58" cy="52" r="2.5" fill="currentColor" />
    </svg>
  );
}

function AudioBars({ levels, wide = false }: { levels: number[]; wide?: boolean }) {
  const count = wide ? 14 : 7;
  const height = wide ? 28 : 32;
  return (
    <span className={wide ? "flex h-8 w-full items-end gap-[3px]" : "flex h-8 w-full items-end justify-center gap-[3px]"} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const level = levels[index] ?? 0;
        return <span key={index} className="block w-full min-w-[3px] flex-1 rounded-full bg-accent" style={{ height: `${Math.max(3, Math.round((level / 100) * height))}px` }} />;
      })}
    </span>
  );
}

type Line = { from: "you" | "sarah"; text: string };
type LiveRoom = import("livekit-client").Room;

function portalPath(to: string) {
  const base = window.location.pathname.startsWith("/production/user-portal") ? "/production/user-portal" : "/portal";
  if (to === "/portal") return base;
  if (to.startsWith("/portal/")) return `${base}${to.slice("/portal".length)}`;
  return to;
}

export function SarahWidget() {
  const token = useShopToken();
  const levels = useVoiceLevels();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "chat" | "call">("menu");
  const [spot, setSpot] = useState<{ right: number; bottom: number } | null>(null);
  const [wide, setWide] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState("");
  const [listening, setListening] = useState(false);
  const drag = useRef<{ px: number; py: number; right: number; bottom: number; moved: boolean; spot: { right: number; bottom: number } | null } | null>(null);
  const skipClick = useRef(false);
  const openRef = useRef(false);
  const liveRef = useRef(false);
  const tokenRef = useRef("");
  const actionRef = useRef("");
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const callOn = useRef(false);
  const roomRef = useRef<LiveRoom | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { actionRef.current = actionId; }, [actionId]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => {
    const live = mode === "chat" || mode === "call";
    liveRef.current = live;
    setSarahLive(live);
    if (!live) setVoiceLevels([]);
  }, [mode]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines, actionId]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    const saved = window.localStorage.getItem("mts-sarah-spot");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { right?: number; bottom?: number };
        if (typeof parsed.right === "number" && typeof parsed.bottom === "number") setSpot({ right: parsed.right, bottom: parsed.bottom });
      } catch { /* keep the default corner */ }
    }
    const toggle = () => {
      if (openRef.current && !liveRef.current) setOpen(false);
      else setOpen(true);
    };
    const end = () => {
      callOn.current = false;
      void roomRef.current?.disconnect();
      roomRef.current = null;
      setMode("menu");
      setOpen(false);
    };
    window.addEventListener("mts-sarah-toggle", toggle);
    window.addEventListener("mts-sarah-end", end);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("mts-sarah-toggle", toggle);
      window.removeEventListener("mts-sarah-end", end);
    };
  }, []);

  async function ask(text: string, channel: "chat" | "call") {
    const current = tokenRef.current;
    const trimmed = text.trim();
    if (!current || !trimmed || busy) return;
    if (channel === "call" && roomRef.current) {
      setLines((prev) => [...prev, { from: "you" as const, text: trimmed }].slice(-24));
      await roomRef.current.localParticipant.sendText(trimmed, { topic: "lk.chat" });
      return;
    }
    setLines((prev) => [...prev, { from: "you" as const, text: trimmed }].slice(-24));
    setBusy(true);
    try {
      const result = await askSarah({
        data: { token: current, text: trimmed, channel, actionId: actionRef.current, history: history.current },
      });
      history.current = [...history.current, { role: "user" as const, content: trimmed }, { role: "assistant" as const, content: result.reply }].slice(-6);
      if (result.cartSku) addToCart(result.cartSku);
      if (result.navigate && result.show?.to) window.location.assign(portalPath(result.show.to));
      setActionId(result.actionId || "");
      const extra = result.cards?.length ? ` ${result.cards.map((card) => card.title).join(", ")}.` : "";
      const reply = `${result.reply}${extra}`.trim();
      setLines((prev) => [...prev, { from: "sarah" as const, text: reply }].slice(-24));
    } catch (error) {
      const reply = error instanceof Error ? error.message : "I couldn't do that.";
      setLines((prev) => [...prev, { from: "sarah", text: reply }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (mode !== "call" || !open) return;
    let stopped = false;
    let room: LiveRoom | null = null;
    const attached: HTMLMediaElement[] = [];
    let audio: AudioContext | null = null;
    let timer = 0;
    let pickup: number = 0;
    const run = async () => {
      const current = tokenRef.current;
      if (!current) return;
      setListening(false);
      setLines((prev) => (prev.length ? prev : [{ from: "sarah", text: "Connecting Sarah." }]));
      try {
        const creds = await startSarahCall({ data: { token: current } });
        if (stopped) return;
        const livekit = await import("livekit-client");
        room = new livekit.Room();
        roomRef.current = room;
        room.on(livekit.RoomEvent.TranscriptionReceived, (segments, participant) => {
          for (const segment of segments) {
            const spoken = segment.text?.trim();
            if (!segment.final || !spoken) continue;
            const from: Line["from"] = participant?.isLocal ? "you" : "sarah";
            setLines((prev) => {
              const last = prev[prev.length - 1];
              if (last?.from === from && last.text === spoken) return prev;
              return [...prev, { from, text: spoken }].slice(-24);
            });
          }
        });
        room.on(livekit.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== livekit.Track.Kind.Audio) return;
          const element = track.attach();
          element.autoplay = true;
          element.style.display = "none";
          attached.push(element);
          document.body.appendChild(element);
          audio ??= new AudioContext();
          const source = audio.createMediaElementSource(element);
          const analyser = audio.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyser.connect(audio.destination);
          const bins = new Uint8Array(analyser.frequencyBinCount);
          window.clearInterval(timer);
          timer = window.setInterval(() => {
            analyser.getByteFrequencyData(bins);
            const step = Math.max(1, Math.floor(bins.length / 14));
            setVoiceLevels(Array.from({ length: 14 }, (_, index) => Math.round((bins[index * step] / 255) * 100)));
          }, 80);
        });
        await room.connect(creds.serverUrl, creds.token);
        await room.startAudio();
        void audio?.resume();
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          if (!stopped) setLines((prev) => [...prev, { from: "sarah", text: "The microphone is blocked. You can still type, and Sarah can still speak." }]);
        }
        if (stopped) return;
        callOn.current = true;
        setListening(true);
        window.clearTimeout(pickup);
        pickup = window.setTimeout(() => {
          if (stopped || !room || room.remoteParticipants.size > 0) return;
          setLines((prev) => [...prev, { from: "sarah", text: "Sarah did not pick up. End the call and try again." }]);
        }, 20000);
      } catch (error) {
        if (!stopped) setLines((prev) => [...prev, { from: "sarah", text: error instanceof Error ? error.message : "The call could not connect." }]);
      }
    };
    void run();
    return () => {
      stopped = true;
      callOn.current = false;
      window.clearInterval(timer);
      window.clearTimeout(pickup);
      setListening(false);
      setVoiceLevels([]);
      for (const element of attached) element.remove();
      void audio?.close();
      if (roomRef.current === room) roomRef.current = null;
      void room?.disconnect();
    };
  }, [mode, open]);

  function start(next: "chat" | "call") {
    if (!token) {
      setLines([{ from: "sarah", text: "Sign in first. I can only work on the account that is signed in." }]);
    }
    setMode(next);
    setOpen(true);
  }

  function endSession() {
    callOn.current = false;
    void roomRef.current?.disconnect();
    roomRef.current = null;
    setMode("menu");
    setOpen(false);
    setActionId("");
  }

  async function decide(decision: "confirm" | "cancel") {
    if (!token || !actionId || busy) return;
    setBusy(true);
    try {
      const result = decision === "confirm"
        ? await confirmSarahAction({ data: { token, actionId } })
        : await cancelSarahAction({ data: { token, actionId } });
      if (result.cartSku) addToCart(result.cartSku);
      setActionId("");
      setLines((prev) => [...prev, { from: "sarah", text: result.reply || (decision === "confirm" ? "Done." : "Cancelled.") }]);
    } catch (error) {
      setLines((prev) => [...prev, { from: "sarah", text: error instanceof Error ? error.message : "That did not go through." }]);
    } finally {
      setBusy(false);
    }
  }

  const full = open && (mode === "chat" || mode === "call");
  const place = spot ? { right: spot.right, bottom: spot.bottom } : undefined;

  function clamp(right: number, bottom: number) {
    const size = 64;
    const minBottom = wide ? 8 : 88;
    return {
      right: Math.min(window.innerWidth - size - 8, Math.max(8, right)),
      bottom: Math.min(window.innerHeight - size - 8, Math.max(minBottom, bottom)),
    };
  }

  return (
    <>
      {full ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface md:inset-auto md:right-4 md:bottom-24 md:h-[min(100dvh-8rem,40rem)] md:w-[24rem] md:overflow-hidden md:rounded-2xl md:shadow-2xl" style={wide ? place : undefined}>
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <p className="text-sm font-semibold">{mode === "call" ? (listening ? "Sarah is listening" : "Sarah") : "Chat with Sarah"}</p>
            <button type="button" aria-label="End support" onClick={endSession}><PhoneOff className="size-4" /></button>
          </header>
          {mode === "call" ? <div className="px-4 pt-3"><AudioBars levels={levels} wide /></div> : null}
          <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {lines.map((line, index) => (
              <p key={`${line.from}-${index}`} className={line.from === "you" ? "ml-8 rounded-2xl bg-accent px-3 py-2 text-sm text-white" : "mr-8 rounded-2xl bg-accent-soft px-3 py-2 text-sm text-ink"}>{line.text}</p>
            ))}
            {!token ? <p className="text-sm text-muted">Sign in, then tell Sarah what you need.</p> : null}
          </div>
          {actionId ? (
            <div className="grid grid-cols-2 gap-2 px-4 pb-2">
              <button type="button" disabled={busy} onClick={() => void decide("confirm")} className="h-11 rounded-xl bg-accent text-sm font-semibold text-white">Confirm</button>
              <button type="button" disabled={busy} onClick={() => void decide("cancel")} className="h-11 rounded-xl border border-line text-sm font-semibold">Cancel</button>
            </div>
          ) : null}
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const text = draft;
              setDraft("");
              void ask(text, mode === "call" ? "call" : "chat");
            }}
          >
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={mode === "call" ? "Or type it" : "Tell Sarah what you need"} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="grid size-11 place-items-center rounded-xl bg-ink text-white"><Send className="size-4" /></button>
          </form>
        </div>
      ) : null}
      <div className={full ? "hidden" : open ? "fixed inset-x-0 bottom-0 z-40 flex justify-end md:inset-x-auto md:right-4 md:bottom-24 md:w-[24rem]" : "hidden"} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="flex w-full flex-col items-stretch gap-2 px-3 md:w-[24rem] md:items-end md:px-0">
          {open && mode === "menu" ? (
            <section className="grid w-full gap-3 self-end rounded-2xl border border-line bg-surface p-4 shadow-lg md:w-80">
              <div className="flex items-center justify-between text-ink">
                <p className="text-sm font-semibold">Support</p>
                <button type="button" aria-label="Close support" onClick={() => setOpen(false)}><X className="size-4" /></button>
              </div>
              <p className="text-sm text-muted">Tell Sarah what you need. She does it on this account.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => start("chat")} className="grid h-20 place-items-center gap-1 rounded-xl bg-accent text-sm font-semibold text-white">
                  <Send className="size-5" />
                  Chat
                </button>
                <button type="button" onClick={() => start("call")} className="grid h-20 place-items-center gap-1 rounded-xl border border-line bg-accent-soft text-sm font-semibold text-ink">
                  <Phone className="size-5" />
                  Call
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="Talk to support"
        aria-expanded={open}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          drag.current = { px: event.clientX, py: event.clientY, right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom, moved: false, spot: null };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const next = clamp(current.right - (event.clientX - current.px), current.bottom - (event.clientY - current.py));
          if (Math.hypot(event.clientX - current.px, event.clientY - current.py) > 6) current.moved = true;
          current.spot = next;
          setSpot(next);
        }}
        onPointerUp={() => {
          const current = drag.current;
          drag.current = null;
          if (!current?.moved || !current.spot) return;
          skipClick.current = true;
          window.localStorage.setItem("mts-sarah-spot", JSON.stringify(current.spot));
        }}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          if (open && mode === "menu") setOpen(false);
          else setOpen(true);
        }}
        style={place}
        className={full ? "hidden" : "fixed right-4 bottom-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] z-50 grid size-16 touch-none cursor-grab place-items-center rounded-full bg-ink text-white shadow-[0_8px_24px_rgba(0,57,112,0.28)] ring-4 ring-white active:cursor-grabbing md:bottom-4"}
      >
        <AgentMark />
      </button>
    </>
  );
}


export function SarahHeaderButton() {
  const live = useSarahLive();
  const levels = useVoiceLevels();
  return (
    <span className="flex items-center md:hidden">
      <button type="button" className={live ? "flex h-9 w-[42vw] max-w-60 items-center justify-center rounded-full bg-accent-soft px-3" : "grid size-10 place-items-center rounded-xl text-ink"} aria-label={live ? "Sarah is still on the line" : "Talk to support"} onClick={() => window.dispatchEvent(new Event("mts-sarah-toggle"))}>
        {live ? <AudioBars levels={levels} wide /> : <AgentMark className="size-6" />}
      </button>
      {live ? (
        <button type="button" className="ml-1 grid size-8 place-items-center rounded-full bg-[#8e1f0b] text-white" aria-label="End support" onClick={() => window.dispatchEvent(new Event("mts-sarah-end"))}>
          <PhoneOff className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}
