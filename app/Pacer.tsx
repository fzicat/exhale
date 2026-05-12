"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORE_KEY = "exhale.settings.v1";
const DEFAULTS = { inhale: 4.0, exhale: 6.0, warning: 1.0, wakeLock: false };
const PITCH = { high: 880, medium: 660, low: 392 }; // A5, E5, G4
const LOOKAHEAD = 12.0;
const SCHEDULE_INTERVAL_MS = 2000;

type Settings = { inhale: number; exhale: number; warning: number; wakeLock: boolean };

function sanitize(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  // 1 decimal precision, clamp to a sane range
  const rounded = Math.round(n * 10) / 10;
  return Math.min(60, Math.max(0.5, rounded));
}

function sanitizeWarning(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  const rounded = Math.round(n * 10) / 10;
  return Math.min(30, Math.max(0.1, rounded));
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    const obj = JSON.parse(raw);
    return {
      inhale: sanitize(obj.inhale, DEFAULTS.inhale),
      exhale: sanitize(obj.exhale, DEFAULTS.exhale),
      warning: sanitizeWarning(obj.warning, DEFAULTS.warning),
      wakeLock: !!obj.wakeLock,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

type ScheduledChime = {
  id: number;
  time: number;
  osc: OscillatorNode;
  gain: GainNode;
};

export default function Pacer() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"inhale" | "exhale" | "idle">("idle");
  const [labelText, setLabelText] = useState("Tap to start");

  // refs that need to stay live across rAF / scheduler ticks without re-renders
  const audioRef = useRef<AudioContext | null>(null);
  const scheduledRef = useRef<ScheduledChime[]>([]);
  const nextChimeIdRef = useRef(1);
  const cycleStartRef = useRef(0);
  const inhaleDurRef = useRef(DEFAULTS.inhale);
  const exhaleDurRef = useRef(DEFAULTS.exhale);
  const warningDurRef = useRef(DEFAULTS.warning);
  const lastScheduledThroughRef = useRef(0);
  const runningRef = useRef(false);
  const scheduleTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wantWakeLockRef = useRef(false);

  const columnRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inhaleInputRef = useRef<HTMLInputElement>(null);
  const exhaleInputRef = useRef<HTMLInputElement>(null);
  const warningInputRef = useRef<HTMLInputElement>(null);
  const wakeInputRef = useRef<HTMLInputElement>(null);

  // Load persisted settings on mount
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    inhaleDurRef.current = s.inhale;
    exhaleDurRef.current = s.exhale;
    warningDurRef.current = s.warning;
    wantWakeLockRef.current = s.wakeLock;
  }, []);

  // Register service worker (only in production builds; dev SW caching can be confusing)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  const ensureAudio = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return null;
      audioRef.current = new Ctx();
    }
    if (audioRef.current.state === "suspended") {
      void audioRef.current.resume();
    }
    return audioRef.current;
  }, []);

  const scheduleChime = useCallback(
    (when: number, freq: number, durationSec = 0.45, peakGain = 0.18) => {
      const ctx = audioRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = Math.max(when, ctx.currentTime + 0.001);
      const t1 = t0 + durationSec;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.05);
      const id = nextChimeIdRef.current++;
      const entry: ScheduledChime = { id, time: t0, osc, gain };
      scheduledRef.current.push(entry);
      osc.onended = () => {
        scheduledRef.current = scheduledRef.current.filter((e) => e.id !== id);
      };
    },
    []
  );

  const cancelFutureChimes = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) {
      scheduledRef.current = [];
      return;
    }
    const now = ctx.currentTime;
    const keep: ScheduledChime[] = [];
    for (const s of scheduledRef.current) {
      if (s.time <= now + 0.05) {
        keep.push(s);
        continue;
      }
      try {
        s.gain.gain.cancelScheduledValues(now);
        s.gain.gain.setValueAtTime(0.0001, now);
      } catch {}
      try {
        s.osc.stop(now);
      } catch {}
    }
    scheduledRef.current = keep;
  }, []);

  const scheduleAhead = useCallback(() => {
    const ctx = audioRef.current;
    if (!runningRef.current || !ctx) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const inhale = inhaleDurRef.current;
    const exhale = exhaleDurRef.current;
    const warning = warningDurRef.current;
    const cycle = inhale + exhale;
    if (cycle <= 0) return;

    let nStart = cycleStartRef.current;
    while (nStart + cycle <= lastScheduledThroughRef.current) nStart += cycle;

    for (let s = nStart; s <= horizon; s += cycle) {
      const events: Array<{ t: number; freq: number; gate: boolean }> = [
        { t: s, freq: PITCH.high, gate: true },
        { t: s + Math.max(0, inhale - warning), freq: PITCH.medium, gate: inhale > warning },
        { t: s + inhale, freq: PITCH.low, gate: true },
        {
          t: s + inhale + Math.max(0, exhale - warning),
          freq: PITCH.medium,
          gate: exhale > warning,
        },
      ];
      for (const e of events) {
        if (!e.gate) continue;
        if (
          e.t > lastScheduledThroughRef.current &&
          e.t <= horizon &&
          e.t >= now - 0.01
        ) {
          scheduleChime(e.t, e.freq);
        }
      }
    }
    lastScheduledThroughRef.current = horizon;
  }, [scheduleChime]);

  const requestWakeLock = useCallback(async () => {
    if (!wantWakeLockRef.current) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    const s = wakeLockRef.current;
    if (s) {
      try {
        void s.release();
      } catch {}
      wakeLockRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
    const ctx = audioRef.current;
    if (!runningRef.current || !ctx) return;
    const now = ctx.currentTime;
    const inhale = inhaleDurRef.current;
    const exhale = exhaleDurRef.current;
    const cycle = inhale + exhale;
    if (cycle <= 0) return;
    let pos = now - cycleStartRef.current;
    if (pos < 0) pos = 0;
    pos = pos - Math.floor(pos / cycle) * cycle;
    let pct: number;
    let nextPhase: "inhale" | "exhale";
    if (pos < inhale) {
      pct = inhale > 0 ? pos / inhale : 0;
      nextPhase = "inhale";
    } else {
      const into = pos - inhale;
      pct = exhale > 0 ? 1 - into / exhale : 0;
      nextPhase = "exhale";
    }
    if (columnRef.current) {
      columnRef.current.style.height = (pct * 100).toFixed(2) + "%";
    }
    setPhase((prev) => (prev === nextPhase ? prev : nextPhase));
  }, []);

  const startPacer = useCallback(() => {
    if (runningRef.current) return;
    const ctx = ensureAudio();
    if (!ctx) {
      setLabelText("Audio unavailable");
      return;
    }
    inhaleDurRef.current = settings.inhale;
    exhaleDurRef.current = settings.exhale;
    warningDurRef.current = settings.warning;
    cycleStartRef.current = ctx.currentTime + 0.15;
    lastScheduledThroughRef.current = ctx.currentTime;
    runningRef.current = true;
    setRunning(true);
    setPhase("inhale");
    void requestWakeLock();
    scheduleAhead();
    if (scheduleTimerRef.current === null) {
      scheduleTimerRef.current = window.setInterval(scheduleAhead, SCHEDULE_INTERVAL_MS);
    }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [ensureAudio, requestWakeLock, scheduleAhead, settings.exhale, settings.inhale, settings.warning, tick]);

  const stopPacer = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setPhase("idle");
    if (scheduleTimerRef.current !== null) {
      clearInterval(scheduleTimerRef.current);
      scheduleTimerRef.current = null;
    }
    cancelFutureChimes();
    if (columnRef.current) columnRef.current.style.height = "0%";
    setLabelText("Tap to start");
    releaseWakeLock();
  }, [cancelFutureChimes, releaseWakeLock]);

  const applySettingsChange = useCallback(
    (newInhale: number, newExhale: number, newWarning: number, newWakeLock: boolean) => {
      const prevInhale = inhaleDurRef.current;
      const prevExhale = exhaleDurRef.current;
      const next: Settings = {
        inhale: newInhale,
        exhale: newExhale,
        warning: newWarning,
        wakeLock: newWakeLock,
      };
      setSettings(next);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {}
      wantWakeLockRef.current = newWakeLock;
      warningDurRef.current = newWarning;

      if (!runningRef.current) {
        inhaleDurRef.current = newInhale;
        exhaleDurRef.current = newExhale;
        if (!newWakeLock) releaseWakeLock();
        return;
      }
      const ctx = audioRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      const elapsed = now - cycleStartRef.current;
      const oldCycle = prevInhale + prevExhale;
      const wrapped = ((elapsed % oldCycle) + oldCycle) % oldCycle;
      let newOffset: number;
      if (wrapped < prevInhale) {
        const frac = prevInhale > 0 ? wrapped / prevInhale : 0;
        newOffset = Math.min(frac * newInhale, newInhale);
      } else {
        const into = wrapped - prevInhale;
        const frac = prevExhale > 0 ? into / prevExhale : 0;
        newOffset = newInhale + Math.min(frac * newExhale, newExhale);
      }
      inhaleDurRef.current = newInhale;
      exhaleDurRef.current = newExhale;
      cycleStartRef.current = now - newOffset;
      cancelFutureChimes();
      lastScheduledThroughRef.current = now;
      scheduleAhead();
      if (newWakeLock && !wakeLockRef.current) void requestWakeLock();
      if (!newWakeLock) releaseWakeLock();
    },
    [cancelFutureChimes, releaseWakeLock, requestWakeLock, scheduleAhead]
  );

  // Visibility handling: re-acquire wake lock and catch up scheduling on return.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (runningRef.current && wantWakeLockRef.current && !wakeLockRef.current) {
        void requestWakeLock();
      }
      if (runningRef.current) scheduleAhead();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [requestWakeLock, scheduleAhead]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (scheduleTimerRef.current !== null) clearInterval(scheduleTimerRef.current);
      cancelFutureChimes();
      releaseWakeLock();
      if (audioRef.current) {
        try {
          void audioRef.current.close();
        } catch {}
        audioRef.current = null;
      }
    };
  }, [cancelFutureChimes, releaseWakeLock]);

  const onStageClick = () => {
    if (!runningRef.current) startPacer();
    else stopPacer();
  };

  const openSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (inhaleInputRef.current) inhaleInputRef.current.value = settings.inhale.toFixed(1);
    if (exhaleInputRef.current) exhaleInputRef.current.value = settings.exhale.toFixed(1);
    if (warningInputRef.current) warningInputRef.current.value = settings.warning.toFixed(1);
    if (wakeInputRef.current) wakeInputRef.current.checked = settings.wakeLock;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  };

  const onFormSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value;
    if (action !== "save") return;
    ev.preventDefault();
    const newInhale = sanitize(inhaleInputRef.current?.value, settings.inhale);
    const newExhale = sanitize(exhaleInputRef.current?.value, settings.exhale);
    const newWarning = sanitizeWarning(warningInputRef.current?.value, settings.warning);
    const newWake = !!wakeInputRef.current?.checked;
    applySettingsChange(newInhale, newExhale, newWarning, newWake);
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        ref={stageRef}
        type="button"
        className="stage"
        data-running={running}
        data-phase={phase === "idle" ? undefined : phase}
        aria-label={running ? "Stop breath pacer" : "Start breath pacer"}
        onClick={onStageClick}
      >
        <div ref={columnRef} className="column" aria-hidden="true" />
        <div className="phase-label" aria-live="polite">
          {labelText}
        </div>
      </button>

      <button
        type="button"
        className="gear"
        aria-label="Open settings"
        title="Settings"
        onClick={openSettings}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.67 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94 0 .32.02.63.05.94L2.79 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"
          />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="settings"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <form method="dialog" onSubmit={onFormSubmit}>
          <h2>Settings</h2>
          <label>
            Inhale (seconds)
            <input
              ref={inhaleInputRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.5"
              max="60"
              defaultValue={settings.inhale.toFixed(1)}
            />
          </label>
          <label>
            Exhale (seconds)
            <input
              ref={exhaleInputRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.5"
              max="60"
              defaultValue={settings.exhale.toFixed(1)}
            />
          </label>
          <label>
            Warning chime lead time (seconds)
            <input
              ref={warningInputRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max="30"
              defaultValue={settings.warning.toFixed(1)}
            />
          </label>
          <label className="check">
            <input
              ref={wakeInputRef}
              type="checkbox"
              defaultChecked={settings.wakeLock}
            />
            Keep screen awake (when supported)
          </label>
          <div className="actions">
            <button value="cancel" type="submit">
              Cancel
            </button>
            <button value="save" type="submit" className="primary">
              Save
            </button>
          </div>
          <p className="note">Settings are stored locally in your browser.</p>
        </form>
      </dialog>
    </>
  );
}
