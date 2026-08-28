import { forwardRef, useId } from "react";
import { Phone, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatNationalDigits,
  groupDigits,
  nationalPhoneDigits,
  parseMoney,
  phoneDigits,
} from "@/lib/format";

/**
 * Uzbek phone field. Whatever the user types, the value handed to the form is
 * always the canonical "+998 90 123 45 67" — so the same number can never be
 * stored in two shapes and search stays predictable.
 */
export const PhoneInput = forwardRef<
  HTMLInputElement,
  {
    value: string | null | undefined;
    onChange: (value: string) => void;
    onBlur?: () => void;
    id?: string;
    className?: string;
    disabled?: boolean;
    "data-testid"?: string;
  }
>(function PhoneInput({ value, onChange, onBlur, className, disabled, ...rest }, ref) {
  const national = nationalPhoneDigits(value);
  const display = national ? formatNationalDigits(national, true) : "+998 ";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    let digits = nationalPhoneDigits(raw);
    // Backspace landed on a separator: the digit count did not change, so the
    // reformat would undo the keystroke. Drop the last digit instead.
    if (raw.length < display.length && phoneDigits(raw).length === phoneDigits(display).length) {
      digits = digits.slice(0, -1);
    }
    onChange(digits ? formatNationalDigits(digits, true) : "");
  };

  return (
    <div className="relative">
      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder="+998 90 123 45 67"
        className={cn("pl-9 tabular tracking-wide", className)}
        // Typing anywhere but the end fights the mask; park the caret at the end.
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onClick={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart !== null && el.selectionStart < 5) el.setSelectionRange(el.value.length, el.value.length);
        }}
        {...rest}
      />
    </div>
  );
});

/**
 * So'm field. Displays grouped thousands ("1 250 000") while holding a plain
 * integer in the form state.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    value: number | string | null | undefined;
    onChange: (value: number) => void;
    onBlur?: () => void;
    id?: string;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    "data-testid"?: string;
  }
>(function MoneyInput({ value, onChange, onBlur, placeholder = "0", className, disabled, ...rest }, ref) {
  const numeric = typeof value === "number" ? value : parseMoney(String(value ?? ""));
  const display = numeric ? groupDigits(numeric) : "";

  return (
    <div className="relative">
      <Input
        ref={ref}
        inputMode="numeric"
        value={display}
        onChange={(e) => onChange(parseMoney(e.target.value))}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={cn("pr-14 tabular text-right", className)}
        {...rest}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
        so'm
      </span>
    </div>
  );
});

/** Search field with a clear button — the same control on every list screen. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Qidirish...",
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Tozalash"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
