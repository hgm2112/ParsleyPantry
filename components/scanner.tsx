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

type ScannerProps = {
  onDetect: (barcode: string) => void;
  active?: boolean;
  /** Ignore repeats of the same code for this long. */
  cooldownMs?: number;
  className?: string;
};

const ZXING_FORMATS = [
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "CODE_128",
  "CODE_39",
  "ITF",
];

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

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const [status, setStatus] = useState<Status>("starting");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const handleCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    const last = lastRef.current;
    if (last.code === code && now - last.at < cooldownMs) return;
    lastRef.current = { code, at: now };
    beep("scan");
    vibrate(30);
    onDetectRef.current(code);
  }, [cooldownMs]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    if (!video) return;

    setStatus("starting");
    setErrorDetail(null);

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
        await video.play();
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }

      const track = stream.getVideoTracks()[0];
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
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeCtor) {
        const detector = new BarcodeCtor({ formats: ZXING_FORMATS });
        const tick = async () => {
          if (cancelled) return;
          if (!detectBusyRef.current && video.readyState >= 2) {
            detectBusyRef.current = true;
            try {
              const results = await detector.detect(video);
              if (results.length > 0 && !cancelled) {
                handleCode(results[0].rawValue);
              }
            } catch {
              // A frame can fail while the camera adjusts; keep going.
            } finally {
              detectBusyRef.current = false;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
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
          (result) => {
            if (result && !cancelled) handleCode(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorDetail(err instanceof Error ? err.message : "Scanner failed");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [active, attempt, handleCode]);

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
          <p className="text-sm font-medium">
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
    </div>
  );
}
