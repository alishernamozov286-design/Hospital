import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { parseBarcode } from "@shared/sample";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * The barcode box: scan a tube, get its order.
 *
 * Built around what a barcode wedge actually is — a keyboard that types the
 * code and presses Enter. So this is a plain text input that acts on submit,
 * not a live search: a wedge delivers its characters in a burst, and a
 * debounced lookup would fire on half-typed prefixes and open the wrong order.
 *
 * The field clears and refocuses after every scan, because the next thing a
 * hand holding a scanner does is scan again.
 */
export function SampleScan({
  onFound,
  className,
}: {
  onFound: (order: OrderWithDetails) => void;
  className?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(raw: string) {
    const code = raw.trim();
    if (!code || busy) return;

    // Checked here as well as on the server so an obvious typo costs no round
    // trip and reports the specific problem rather than a generic 404.
    if (parseBarcode(code) === null) {
      toast({ variant: "destructive", title: "Noto'g'ri barcode", description: `"${code}" o'qib bo'lmadi` });
      setValue("");
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest("GET", `/api/samples/scan?code=${encodeURIComponent(code)}`);
      const order = (await res.json()) as OrderWithDetails;
      setValue("");
      onFound(order);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Topilmadi",
        description: err instanceof Error ? err.message : String(err),
      });
      setValue("");
    } finally {
      setBusy(false);
      // Refocus even on failure: a mis-scan is retried immediately.
      inputRef.current?.focus();
    }
  }

  return (
    <div className={cn("relative", className)}>
      <ScanLine
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
          busy && "animate-pulse text-primary",
        )}
      />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit(value);
          }
        }}
        placeholder="Barcode skanerlang..."
        className="pl-9 font-mono"
        aria-label="Namuna barcodeini skanerlash"
        data-testid="input-sample-scan"
      />
    </div>
  );
}
