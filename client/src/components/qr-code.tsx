import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A QR code rendered as an inline SVG.
 *
 * SVG rather than the more usual canvas for one reason: this code exists to be
 * *printed*. A canvas is a raster bitmap and comes out of a laser printer with
 * visibly soft module edges at the sizes a result form uses, which is exactly
 * the condition under which a phone camera starts failing to lock on. An SVG
 * is resolution-independent, so the printer renders it at its own DPI and the
 * modules land on crisp black-and-white boundaries.
 *
 * The library is loaded through a dynamic import(): the print dialog is the
 * only place a QR code appears, and most sessions never open it.
 */
export function QrCode({
  value,
  size = 132,
  className,
  /**
   * Error-correction level. "M" (~15% recoverable) is the default rather than
   * the minimum "L" because these codes are printed on paper that gets folded,
   * stamped and carried in a pocket before anyone scans it.
   */
  level = "M",
}: {
  value: string;
  size?: number;
  className?: string;
  level?: "L" | "M" | "Q" | "H";
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);

    if (!value) return;

    (async () => {
      try {
        const QRCode = await import("qrcode");
        const markup = await QRCode.toString(value, {
          type: "svg",
          errorCorrectionLevel: level,
          // The quiet zone is part of the spec, not decoration: scanners use it
          // to find the symbol's edge. Four modules is the specified minimum.
          margin: 4,
          // Pure black on pure white. A tinted code prints as grey on a
          // monochrome laser and loses the contrast a camera thresholds on.
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (!cancelled) setSvg(markup);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, level]);

  if (failed) {
    return (
      <div
        className={cn("flex items-center justify-center border border-black/20 text-[10px] text-black/50", className)}
        style={{ width: size, height: size }}
      >
        QR yaratilmadi
      </div>
    );
  }

  return (
    <div
      className={cn("qr-code shrink-0 bg-white", className)}
      style={{ width: size, height: size }}
      // The library returns a complete standalone <svg> document. Sizing is
      // handled by the wrapper so the markup can be dropped in unchanged.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      aria-hidden={!svg}
    />
  );
}
