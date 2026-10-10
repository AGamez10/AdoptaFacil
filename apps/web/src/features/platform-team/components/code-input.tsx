import { Input } from '@adoptafacil/ui';

interface CodeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}

/** The 6-digit code of the authenticator app: digits only, one-time-code autofill. */
export function CodeInput({
  id,
  value,
  onChange,
  disabled,
  label = 'Código de 6 dígitos',
}: CodeInputProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="123456"
        className="max-w-[10rem] text-center font-mono tracking-[0.3em]"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </div>
  );
}
