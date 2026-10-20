"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { listQrEntries, qrHref } from "@/lib/lookup";
import { qrIdFromScan } from "@/lib/qrScan";

// Se analiza una versión reducida del cuadro y no todos los cuadros: alcanza para leer un QR de etiqueta.
const SCAN_WIDTH = 480;
const SCAN_INTERVAL_MS = 120;
const REJECT_COOLDOWN_MS = 2500;

type Status = "starting" | "scanning" | "error";

/** Escáner de QR con la cámara del dispositivo. Al leer una etiqueta válida navega a su ficha sin salir de la app. */
export function QrScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Las fichas son estáticas: se precargan para que el salto tras escanear sea inmediato.
    for (const entry of listQrEntries()) router.prefetch(`/p/${entry.qrId}`);
  }, [router]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let lastRejected = { text: "", at: 0 };
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const stopStream = () => stream?.getTracks().forEach((track) => track.stop());

    const fail = (text: string) => {
      setStatus("error");
      setMessage(text);
    };

    const tick = () => {
      if (stopped) return;
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
      if (!context || video.readyState < video.HAVE_ENOUGH_DATA || !video.videoWidth) return;
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
      if (!code?.data) return;

      const qrId = qrIdFromScan(code.data);
      if (qrId) {
        stopped = true;
        clearTimeout(timer);
        stopStream();
        navigator.vibrate?.(60);
        router.push(qrHref(qrId));
        return;
      }
      const now = Date.now();
      if (code.data !== lastRejected.text || now - lastRejected.at > REJECT_COOLDOWN_MS) {
        lastRejected = { text: code.data, at: now };
        setMessage("Ese QR no es de una pieza de este mueble. Probá con otra etiqueta.");
      }
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("Este navegador no permite usar la cámara aquí. La cámara requiere una conexión segura (https) o localhost.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (stopped) {
          stopStream();
          return;
        }
        video.srcObject = stream;
        await video.play();
        setStatus("scanning");
        tick();
      } catch (error) {
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
        fail(
          denied
            ? "No hay permiso para usar la cámara. Habilitalo en los ajustes del navegador y volvé a intentar."
            : "No se pudo abrir la cámara. Revisá que ninguna otra app la esté usando.",
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stopStream();
      video.srcObject = null;
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-900">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {status === "scanning" && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]"
          />
        )}
        {status === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Abriendo la cámara…</p>
        )}
      </div>

      {status === "error" ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {message}
        </p>
      ) : (
        <p aria-live="polite" className={`text-sm ${message ? "text-amber-800" : "text-slate-600"}`}>
          {message ?? "Apuntá la cámara al QR de la etiqueta de la pieza."}
        </p>
      )}
    </div>
  );
}
