"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { RegistrationForm } from "./RegistrationForm";
import { LoginForm } from "./LoginForm";
import { ThemeToggle } from "../ThemeToggle";
import s from "./Auth.module.css";
function AuthNotice({
  mode,
  onClose,
}: {
  mode: "register" | "recovery";
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.auth__notice}
      aria-labelledby="notice-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        className={s.auth__noticeClose}
        onClick={onClose}
        aria-label="Закрыть окно"
      >
        <X />
      </button>
      <h2 id="notice-title">
        {mode === "register" ? "Регистрация" : "Восстановление доступа"}
      </h2>
      <p>
        {mode === "register"
          ? "Регистрация пока не подключена. Создание аккаунта станет доступно после подключения сервиса авторизации."
          : "Восстановление пароля пока не подключено. Письмо не отправлено."}
      </p>
      <button className={s.auth__submit} onClick={onClose}>
        Вернуться ко входу
        <ArrowRight />
      </button>
    </dialog>
  );
}
export function LoginCard({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<"register" | "recovery" | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registeredEmail,setRegisteredEmail] = useState("");
  const [swinging, setSwinging] = useState(false);
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
      <motion.section
        className={`${s.auth__card} ${registering ? s.auth__registrationCard : ""} ${swinging ? s.auth__swinging : ""}`}
        aria-labelledby="login-title"
        onPointerEnter={() => { if (!reduced && !swinging) setSwinging(true); }}
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target) setSwinging(false);
        }}
        initial={false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 120,
          damping: 23,
          delay: reduced ? 0 : 0.12,
        }}
      >
        <div className={s.auth__slot} aria-hidden="true" />
        <ThemeToggle />
        {children}
        <div className={s.auth__intro}>
          {registering && <p className={s.auth__eyebrow}>Новый доступ</p>}
          <h1 id="login-title">{registering ? "Создайте аккаунт" : "Войдите в Workspace AI"}</h1>
          <p>{registering ? "Единое рабочее пространство для диалогов, памяти и подключенных источников." : <>Продолжите работу с контекстом, памятью<br />и задачами — там, где вы остановились.</>}</p>
        </div>
        {registeredEmail && !registering && <p className={s.auth__registrationSuccess} role="status">Аккаунт создан. Войдите с вашим паролем.</p>}
        <motion.div key={registering ? "register" : "login"} initial={false} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.18 }}>
          {registering ? <RegistrationForm onRegistered={email=>{setRegisteredEmail(email);setRegistering(false);requestAnimationFrame(()=>document.getElementById("login-password")?.focus())}} /> : <LoginForm initialEmail={registeredEmail} onRecovery={() => setNotice("recovery")} />}
        </motion.div>
        <div className={s.auth__divider}>
          <span />
          или
          <span />
        </div>
        <div className={s.auth__registerPrompt}>
          <span>{registering ? "Уже есть аккаунт?" : "Нет аккаунта?"}</span>
          <button
            className={s.auth__textButton}
            onClick={() => { setRegistering(!registering); requestAnimationFrame(() => document.getElementById(registering ? "login-email" : "register-name")?.focus()); }}
          >
            {registering ? "Войти" : "Зарегистрироваться"}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </motion.section>
      {notice && <AuthNotice mode={notice} onClose={() => setNotice(null)} />}
    </MotionConfig>
  );
}
