"use client";
import { useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, User } from "lucide-react";
import { GlassInput } from "./GlassInput";
import { signUp, AuthApiError } from "@/lib/auth";
import s from "./Auth.module.css";

type Fields = { name: string; email: string; password: string; confirmation: string };
export function RegistrationForm({onRegistered}:{onRegistered:(email:string)=>void}) {
  const [values, setValues] = useState<Fields>({ name: "", email: "", password: "", confirmation: "" });
  const [errors, setErrors] = useState<Partial<Fields>>({});
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  function update(key: keyof Fields, value: string) {
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: undefined, ...(key === "password" ? { confirmation: undefined } : {}) }));
    setMessage("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const next: Partial<Fields> = {};
    if (values.name.trim().length < 2 || values.name.trim().length > 255) next.name = "Имя должно содержать от 2 до 255 символов.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = "Введите корректную электронную почту.";
    if (values.password.length < 8 || values.password.length > 128) next.password = "Пароль должен содержать от 8 до 128 символов.";
    if (!values.confirmation) next.confirmation = "Повторите пароль.";
    else if (values.password !== values.confirmation) next.confirmation = "Пароли не совпадают.";
    setErrors(next);
    setMessage("");
    const first = Object.keys(next)[0];
    if (first) { document.getElementById(`register-${first}`)?.focus(); return; }
    pending.current = true;
    setLoading(true);
    try {
      await signUp({ name: values.name.trim(), email: values.email.trim(), password: values.password });
      onRegistered(values.email.trim());
    } catch (error) {
      if (error instanceof AuthApiError) setErrors(error.fields);
      setMessage(error instanceof TypeError ? "Нет соединения с сервером. Попробуйте ещё раз." : error instanceof Error ? error.message : "Не удалось зарегистрироваться. Попробуйте ещё раз.");
    } finally { pending.current = false; setLoading(false); }
  }
  return <form className={s.auth__form} onSubmit={(event) => { void submit(event); }} noValidate aria-busy={loading}>
    <div className={s.auth__inputs}>
      <GlassInput id="register-name" label="Ваше имя" icon={User} placeholder="Ваше имя" autoComplete="name" minLength={2} maxLength={255} value={values.name} onChange={e => update("name", e.target.value)} error={errors.name} required disabled={loading}/>
      <GlassInput id="register-email" label="Электронная почта" icon={Mail} type="email" inputMode="email" placeholder="Электронная почта" autoComplete="email" value={values.email} onChange={e => update("email", e.target.value)} error={errors.email} required disabled={loading}/>
      <GlassInput id="register-password" label="Пароль" icon={LockKeyhole} type={visible ? "text" : "password"} placeholder="Пароль — от 8 символов" autoComplete="new-password" minLength={8} maxLength={128} value={values.password} onChange={e => update("password", e.target.value)} error={errors.password} required disabled={loading} trailing={<button className={s.auth__eye} type="button" aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <Eye aria-hidden="true"/> : <EyeOff aria-hidden="true"/>}</button>}/>
      <GlassInput id="register-confirmation" label="Повторите пароль" icon={LockKeyhole} type={visible ? "text" : "password"} placeholder="Повторите пароль" autoComplete="new-password" minLength={8} maxLength={128} value={values.confirmation} onChange={e => update("confirmation", e.target.value)} error={errors.confirmation} required disabled={loading}/>
    </div>
    <button type="submit" className={s.auth__submit} disabled={loading}>{loading ? <><LoaderCircle className={s.auth__spinner} aria-hidden="true"/>Создаём аккаунт…</> : <>Зарегистрироваться<ArrowRight aria-hidden="true"/></>}</button>
    {message && <p className={s.auth__formMessage} role="alert">{message}</p>}
  </form>;
}
