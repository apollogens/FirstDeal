"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { GlassInput } from "./GlassInput";
import { signIn, AuthApiError, safeReturnPath } from "@/lib/auth";
import s from "./Auth.module.css";
export function LoginForm({ onRecovery, initialEmail = "" }: { onRecovery: () => void; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const reduce = useReducedMotion();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending.current) return;
    const next = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? undefined
        : "Введите корректную электронную почту.",
      password: password.length >= 8 && password.length <= 128 ? undefined : "Пароль должен содержать от 8 до 128 символов.",
    };
    setErrors(next);
    setMessage("");
    if (next.email || next.password) {
      document
        .getElementById(next.email ? "login-email" : "login-password")
        ?.focus();
      return;
    }
    pending.current = true;
    setLoading(true);
    try {
      await signIn({ email: email.trim(), password, remember });
      window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get("next")));
    } catch (error) {
      if (error instanceof AuthApiError) setErrors(error.fields);
      setMessage(
        error instanceof TypeError
          ? "Нет соединения с сервером. Проверьте подключение и попробуйте снова."
          : error instanceof Error
            ? error.message
            : "Не удалось войти. Попробуйте ещё раз.",
      );
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  return (
    <form className={s.auth__form} onSubmit={(event) => { void submit(event); }} noValidate aria-busy={loading}>
      <div className={s.auth__inputs}>
        <GlassInput
          id="login-email"
          label="Электронная почта"
          icon={Mail}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Электронная почта"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: undefined }));
            setMessage("");
          }}
          error={errors.email}
          required
          disabled={loading}
        />
        <GlassInput
          id="login-password"
          label="Пароль"
          icon={LockKeyhole}
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          minLength={8}
          maxLength={128}
          placeholder="Пароль"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((prev) => ({ ...prev, password: undefined }));
            setMessage("");
          }}
          error={errors.password}
          required
          disabled={loading}
          trailing={
            <button
              className={s.auth__eye}
              type="button"
              aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? (
                <Eye aria-hidden="true" />
              ) : (
                <EyeOff aria-hidden="true" />
              )}
            </button>
          }
        />
      </div>
      <div className={s.auth__options}>
        <label className={s.auth__remember}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className={s.auth__check}>
            <Check aria-hidden="true" />
          </span>
          <span>Запомнить меня</span>
        </label>
        <button className={s.auth__textButton} type="button" onClick={onRecovery}>
          Забыли пароль?
        </button>
      </div>
      <motion.button
        type="submit"
        tabIndex={0}
        className={s.auth__submit}
        disabled={loading}
        whileHover={reduce ? undefined : { y: -1 }}
        whileTap={reduce ? undefined : { scale: 0.99 }}
        transition={{ duration: 0.16 }}
      >
        {loading ? (
          <>
            <LoaderCircle className={s.auth__spinner} aria-hidden="true" />
            Входим…
          </>
        ) : (
          <>
            Войти
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </motion.button>
      {message && (
        <p role="alert" className={s.auth__formMessage}>
          {message}
        </p>
      )}
    </form>
  );
}
