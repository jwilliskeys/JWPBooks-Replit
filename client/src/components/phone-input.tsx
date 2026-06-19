import { Input } from "@/components/ui/input";
import { normalizePhoneInput } from "@/lib/utils";
import React from "react";

type InputProps = React.ComponentPropsWithoutRef<typeof Input>;

interface PhoneInputProps extends Omit<InputProps, "onChange" | "type" | "inputMode"> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Drop-in phone input that auto-formats to (xxx)-xxx-xxxx as the user types.
 * Strips leading country code 1. Accepts raw or formatted values as initial value.
 */
export function PhoneInput({ value, onChange, placeholder, className, ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(e) => onChange(normalizePhoneInput(e.target.value))}
      placeholder={placeholder ?? "(801)-555-1234"}
      className={className}
    />
  );
}
