"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Flashlight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DecodeHintType } from "@zxing/library";
import { beep, vibrate } from "@/lib/beep";

type Status =
  | "starting"
  | "scanning"
  | "denied"
  | "nocamera"
  | "error";

type Decoder = "pending" | "native" | "zxing";

type ScannerProps = {
  onDetect: (barcode: string) => void;
  active?: boolean;
  /** Ignore repeats of the same code for this long. */
  cooldownMs?: number;
  className?: string;
};

/** @zxing/library BarcodeFormat enum names (uppercase). */
const ZXING_FORMATS = [
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "CODE_128",
  "CODE_39",
  "ITF",
];

/** Shape Detection API format names (lowercase, per spec). */
const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
];

const NATIVE_ERROR_FALLBACK = 5;
const NATIVE_TIMEOUT_FALLBACK_MS = 8000;
const PLAY_TIMEOUT_MS = 8000;
const DEBUG_STORAGE_KEY = "pp-scan-debug";

type NativeBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

type NativeBarcodeDetectorCtor = {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

type ScanStats = {
  decoder: Decoder;
  fallbackReason: string | null;
  standalone: boolean;
  supportedFormats: string[] | null;
  videoWidth: number;
  videoHeight: number;
  readyState: number;
  detectCalls: number;
  detectResults: number;
  detectErrors: number;
  lastDetectError: string | null;
  zxingResults: number;
  zxingErrors: number;
  lastZxingError: string | null;
  emits: number;
  cooldownSkips: number;
  lastCodeMasked: string | null;
};

function freshStats(): ScanStats {
  return {
    decoder: "pending",
    fallbackReason: null,
    standalone: false,
    supportedFormats: null,
    videoWidth: 0,
    videoHeight: 0,
    readyState: 0,
    detectCalls: 0,
    detectResults: 0,
    detectErrors: 0,
    lastDetectError: null,
    zxingResults: 0,
    zxingErrors: 0,
    lastZxingError: null,
    emits: 0,
    cooldownSkips: 0,
    lastCodeMasked: null,
  };
}

/** Keep only the last 4 characters so the overlay never shows a full code. */
function maskCode(code: string): string {
  return code.length > 4 ? `••${code.slice(-4)}` : `••${code}`;
}

function readDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("debug");
    if (param === "scan") {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, "1");
      return true;
    }
    if (param === "scanoff") {
      window.localStorage.removeItem(DEBUG_STORAGE_KEY);
      return false;
    }
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Scanner({
  onDetect,
  active = true,
  cooldownMs = 1500,
  className = "",
}: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const detectBusyRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  const statsRef = useRef<ScanStats>(freshStats());
  const debugRef = useRef(false);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const [status, setStatus] = useState<Status>("starting");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [forceZxing, setForceZxing] = useState(false);
  const [debugOn, setDebugOn] = useState<boolean>(() => readDebugEnabled());
  const [debugSnap, setDebugSnap] = useState<ScanStats | null>(null);

  useEffect(() => {
    debugRef.current = debugOn;
  }, [debugOn]);

  useEffect(() => {
    if (!debugOn) return;
    setDebugSnap({ ...statsRef.current });
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const snap = { ...statsRef.current };
      if (video) {
        snap.videoWidth = video.videoWidth;
        snap.videoHeight = video.videoHeight;
        snap.readyState = video.readyState;
      }
      setDebugSnap(snap);
    }, 1000);
    return () => window.clearInterval(id);
  }, [debugOn]);

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      const last = lastRef.current;
      if (last.code === code && now - last.at < cooldownMs) {
        statsRef.current.cooldownSkips += 1;
        return;
      }
      lastRef.current = { code, at: now };
      statsRef.current.emits += 1;
      statsRef.current.lastCodeMasked = maskCode(code);
      beep("scan");
      vibrate(30);
      onDetectRef.current(code);
    },
    [cooldownMs],
  );

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let watchdogId = 0;
    let playTimerId = 0;
    const video = videoRef.current;
    if (!video) return;

    const stats = statsRef.current;
    stats.decoder = "pending";
    stats.supportedFormats = null;
    stats.detectCalls = 0;
    stats.detectResults = 0;
    stats.detectErrors = 0;
    stats.lastDetectError = null;
    stats.zxingResults = 0;
    stats.zxingErrors = 0;
    stats.lastZxingError = null;
    stats.standalone =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches;
    detectBusyRef.current = false;

    setStatus("starting");
    setErrorDetail(null);

    const fallbackToZxing = (reason: string) => {
      if (cancelled) return;
      stats.fallbackReason = reason;
      if (debugRef.current) {
        console.debug("[scan] falling back to zxing:", reason);
      }
      setForceZxing(true);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
          },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (debugRef.current) {
          console.debug("[scan] getUserMedia failed:", name);
        }
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
        } else {
          setStatus("nocamera");
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      try {
        await Promise.race([
          video.play(),
          new Promise<never>((_, reject) => {
            playTimerId = window.setTimeout(
              () => reject(new Error("Camera preview timed out")),
              PLAY_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (err) {
        window.clearTimeout(playTimerId);
        if (cancelled) return;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        video.srcObject = null;
        setStatus("error");
        setErrorDetail(
          err instanceof Error
            ? err.message
            : "Camera preview failed to start. Try again, or add the item manually.",
        );
        return;
      }
      window.clearTimeout(playTimerId);

      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => {
        if (cancelled) return;
        setStatus("error");
        setErrorDetail("Camera stopped — another app may be using it.");
      });
      const capabilities = (
        track as unknown as {
          getCapabilities?: () => { torch?: boolean };
        }
      ).getCapabilities?.();
      if (capabilities?.torch) setTorchSupported(true);

      if (cancelled) return;
      setStatus("scanning");

      const BarcodeCtor = (
        window as unknown as {
          BarcodeDetector?: NativeBarcodeDetectorCtor;
        }
      ).BarcodeDetector;

      let useNative = false;
      if (!forceZxing && BarcodeCtor) {
        try {
          if (typeof BarcodeCtor.getSupportedFormats === "function") {
            const supported = await BarcodeCtor.getSupportedFormats();
            if (cancelled) return;
            stats.supportedFormats = supported;
            useNative =
              supported.includes("ean_13") || supported.includes("upc_a");
            if (!useNative && debugRef.current) {
              console.debug(
                "[scan] native formats unsupported:",
                supported.join(",") || "(none)",
              );
            }
          } else {
            // Pre-getSupportedFormats Chrome — try the constructor below.
            useNative = true;
          }
        } catch {
          useNative = false;
        }
      }

      if (useNative && BarcodeCtor) {
        stats.decoder = "native";
        let detector: NativeBarcodeDetector;
        try {
          detector = new BarcodeCtor({ formats: NATIVE_FORMATS });
        } catch (err) {
          fallbackToZxing(
            `native-constructor: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        if (debugRef.current) {
          console.debug("[scan] decoder: native");
        }

        let consecutiveErrors = 0;
        watchdogId = window.setTimeout(() => {
          if (cancelled) return;
          if (stats.detectResults === 0) {
            fallbackToZxing("native-no-detections");
          }
        }, NATIVE_TIMEOUT_FALLBACK_MS);

        const tick = async () => {
          if (cancelled) {
            window.clearTimeout(watchdogId);
            return;
          }
          if (!detectBusyRef.current && video.readyState >= 2) {
            detectBusyRef.current = true;
            try {
              const results = await detector.detect(video);
              if (cancelled) return;
              consecutiveErrors = 0;
              stats.detectCalls += 1;
              if (results.length > 0) {
                stats.detectResults += 1;
                handleCode(results[0].rawValue);
              }
            } catch (err) {
              if (cancelled) return;
              consecutiveErrors += 1;
              stats.detectErrors += 1;
              stats.lastDetectError =
                err instanceof Error
                  ? `${err.name}: ${err.message}`
                  : String(err);
              if (debugRef.current) {
                console.debug(
                  "[scan] detect error",
                  consecutiveErrors,
                  stats.lastDetectError,
                );
              }
              if (consecutiveErrors >= NATIVE_ERROR_FALLBACK) {
                window.clearTimeout(watchdogId);
                fallbackToZxing(`native-errors: ${stats.lastDetectError}`);
                return;
              }
            } finally {
              detectBusyRef.current = false;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      stats.decoder = "zxing";
      if (debugRef.current) {
        console.debug(
          "[scan] decoder: zxing",
          stats.fallbackReason ? `(${stats.fallbackReason})` : "",
        );
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const zxing = await import("@zxing/library");
        if (cancelled) return;
        const hints = new Map<DecodeHintType, unknown>([
          [
            zxing.DecodeHintType.POSSIBLE_FORMATS,
            ZXING_FORMATS.map(
              (format) =>
                zxing.BarcodeFormat[format as keyof typeof zxing.BarcodeFormat],
            ),
          ],
        ]);
        const reader = new BrowserMultiFormatReader(
          hints as Map<DecodeHintType, never>,
        );
        const controls = await reader.decodeFromStream(
          stream,
          video,
          (result, error) => {
            if (cancelled) return;
            if (result) {
              stats.zxingResults += 1;
              handleCode(result.getText());
              return;
            }
            if (error) {
              stats.zxingErrors += 1;
              stats.lastZxingError =
                error instanceof Error
                  ? `${error.name}: ${error.message}`
                  : String(error);
              const retryable =
                error instanceof zxing.NotFoundException ||
                error instanceof zxing.ChecksumException ||
                error instanceof zxing.FormatException;
              if (!retryable) {
                if (debugRef.current) {
                  console.debug("[scan] zxing fatal:", stats.lastZxingError);
                }
                setStatus("error");
                setErrorDetail(
                  `Scanner stopped: ${stats.lastZxingError}. Try again, or add the item manually.`,
                );
              }
            }
          },
        );
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorDetail(
          err instanceof Error
            ? err.message
            : "Scanner failed to start. Try again, or add the item manually.",
        );
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(watchdogId);
      window.clearTimeout(playTimerId);
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [active, attempt, handleCode, forceZxing]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  return (
    <div
      className={`relative overflow-hidden bg-black rounded-xl ${className}`}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Target frame */}
      {status === "scanning" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-40 w-[85%] max-w-md rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
            <div className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-primary rounded-tl-md" />
            <div className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-primary rounded-tr-md" />
            <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-primary rounded-bl-md" />
            <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-primary rounded-br-md" />
          </div>
        </div>
      ) : null}

      {status === "starting" ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
          Starting camera…
        </div>
      ) : null}

      {status === "denied" || status === "nocamera" || status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center text-white">
          <CameraOff className="h-8 w-8 text-white/70" />
          <p className="text-sm font-semibold">
            {status === "denied"
              ? "Camera access is blocked"
              : status === "nocamera"
                ? "No camera found"
                : "Camera error"}
          </p>
          <p className="text-xs text-white/70 max-w-xs">
            {status === "denied"
              ? "Allow camera access in your browser settings to scan barcodes. You can still add items manually."
              : (errorDetail ?? "Try again, or add the item manually.")}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw /> Try again
          </Button>
        </div>
      ) : null}

      {torchSupported && status === "scanning" ? (
        <Button
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/50 text-white hover:bg-black/70"
          onClick={toggleTorch}
          aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
        >
          <Flashlight className={torchOn ? "text-yellow-400" : ""} />
        </Button>
      ) : null}

      {debugOn && debugSnap ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 bottom-2 z-10 rounded-md bg-black/75 px-2 py-1 font-mono text-[10px] leading-4 text-white"
        >
          <div>
            decoder: {debugSnap.decoder}
            {debugSnap.fallbackReason ? ` ← ${debugSnap.fallbackReason}` : ""}
          </div>
          <div>
            standalone: {debugSnap.standalone ? "yes" : "no"} · video:{" "}
            {debugSnap.videoWidth}x{debugSnap.videoHeight} · ready:{" "}
            {debugSnap.readyState}
            {debugSnap.supportedFormats
              ? ` · sf: ${debugSnap.supportedFormats.join(",") || "(none)"}`
              : ""}
          </div>
          <div>
            native: calls {debugSnap.detectCalls} · hits{" "}
            {debugSnap.detectResults} · err {debugSnap.detectErrors}
            {debugSnap.lastDetectError ? ` (${debugSnap.lastDetectError})` : ""}
          </div>
          <div>
            zxing: hits {debugSnap.zxingResults} · err {debugSnap.zxingErrors}
            {debugSnap.lastZxingError ? ` (${debugSnap.lastZxingError})` : ""}
          </div>
          <div>
            emit: {debugSnap.emits} · cooldown-skip:{" "}
            {debugSnap.cooldownSkips} · last:{" "}
            {debugSnap.lastCodeMasked ?? "-"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
