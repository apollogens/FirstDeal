import type { InputHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import s from "./Auth.module.css";
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: LucideIcon;
  error?: string;
  trailing?: ReactNode;
};
export function GlassInput({
  label,
  icon: Icon,
  error,
  trailing,
  id,
  ...props
}: Props) {
  return (
    <div className={s.auth__fieldGroup}>
      <label className={s.auth__srOnly} htmlFor={id}>
        {label}
      </label>
      <div className={`${s.auth__field} ${error ? s["auth__field--invalid"] : ""}`}>
        <Icon aria-hidden="true" />
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        {trailing}
      </div>
      {error && (
        <p className={s.auth__fieldError} id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
