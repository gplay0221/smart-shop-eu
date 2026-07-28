import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && !cancelled) {
          cancelled = true;
          controls?.stop();
          onDetected(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (cancelled) c.stop();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Camera unavailable");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetected]);

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Camera unavailable ({error}). Enter the barcode number manually below.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink aspect-video">
      <video ref={videoRef} className="size-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-accent/80" />
    </div>
  );
}
