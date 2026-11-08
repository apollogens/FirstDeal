"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileText,
  KeyRound,
  LifeBuoy,
  Link2,
  LogOut,
  Menu,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth-types";
import s from "./Profile.module.css";

export type ProfileTab = "profile" | "workspace" | "security";

type UserProfile = {
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  bio: string;
  avatarUrl?: string;
  additionalEmail: string;
};

type WorkspaceInfo = {
  id: string;
  name: string;
  type: "personal" | "work";
  role: string;
  joinedAt: string;
  documentsCount: number;
  eventsCount: number;
  memoryFactsCount: number;
  sourcesCount: number;
};

type AccountInfo = {
  createdAt: string;
  lastLoginAt: string;
  role: string;
};

const workspaceFixture: WorkspaceInfo = {
  id: "personal",
  name: "Личное пространство",
  type: "personal",
  role: "Администратор",
  joinedAt: "11 сентября 2026",
  documentsCount: 24,
  eventsCount: 12,
  memoryFactsCount: 8,
  sourcesCount: 4,
};

const accountFixture: AccountInfo = {
  createdAt: "11 сентября 2026",
  lastLoginAt: "16 сентября 2026, 10:24",
  role: "Администратор",
};

const tabs: { id: ProfileTab; label: string }[] = [
  { id: "profile", label: "Профиль" },
  { id: "workspace", label: "Рабочее пространство" },
  { id: "security", label: "Безопасность" },
];

const subscribeDevice = () => () => undefined;
const readDeviceLabel = () => {
  const browser = /Edg\//.test(navigator.userAgent) ? "Edge" : /Chrome\//.test(navigator.userAgent) ? "Chrome" : /Firefox\//.test(navigator.userAgent) ? "Firefox" : "Браузер";
  const platform = /Windows/.test(navigator.userAgent) ? "Windows" : /Mac OS/.test(navigator.userAgent) ? "macOS" : /Android/.test(navigator.userAgent) ? "Android" : /iPhone|iPad/.test(navigator.userAgent) ? "iOS" : "устройство";
  return `${browser} · ${platform}`;
};

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className={s.profile__sectionHeading}><h2>{title}</h2><p>{subtitle}</p></div>;
}

function ActionButton({ icon: Icon, children, onClick }: { icon: typeof KeyRound; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={s.profile__actionButton} onClick={onClick}><Icon /><span>{children}</span><ChevronRight /></button>;
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={s.profile__dialog}
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={s.profile__dialogPanel}>
        <header><h2>{title}</h2><button type="button" aria-label="Закрыть" onClick={onClose}><X /></button></header>
        {children}
      </div>
    </dialog>
  );
}

export function ProfileScreen({
  user,
  initialTab = "profile",
  onTabChange,
  onMenu,
  onLogout,
  loggingOut,
}: {
  user: AuthUser;
  initialTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  onMenu: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const initialProfile = useMemo<UserProfile>(() => ({
    name: user.full_name || "Пользователь",
    email: user.email || "",
    jobTitle: "Продуктовый менеджер",
    department: "Продукт",
    bio: "Использую Workspace AI для работы, планирования и анализа.",
    additionalEmail: "",
  }), [user]);
  const [savedProfile, setSavedProfile] = useState<UserProfile>(initialProfile);
  const [draft, setDraft] = useState<UserProfile>(initialProfile);
  const [photoError, setPhotoError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"password" | "sessions" | null>(null);
  const deviceLabel = useSyncExternalStore(subscribeDevice, readDeviceLabel, () => "Текущий браузер");
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedProfile);

  const selectTab = (next: ProfileTab) => {
    onTabChange?.(next);
  };
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };
  const update = (key: keyof UserProfile, value: string | undefined) => setDraft((current) => ({ ...current, [key]: value }));
  const choosePhoto = (file?: File) => {
    setPhotoError("");
    if (!file) return;
    if (!(["image/jpeg", "image/png"] as string[]).includes(file.type)) {
      setPhotoError("Выберите изображение JPG или PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Размер изображения не должен превышать 5 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("avatarUrl", typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
  };

  return (
    <main className={s.profile__page}>
      <header className={s.profile__pageHeader}>
        <button className={s.profile__mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
        <div><h1>Личный кабинет</h1><p>Ваш профиль и рабочее пространство</p></div>
      </header>

      <nav className={s.profile__tabs} aria-label="Разделы личного кабинета">
        {tabs.map((item) => <button type="button" role="tab" aria-selected={initialTab === item.id} className={initialTab === item.id ? s["profile__tab--active"] : ""} key={item.id} onClick={() => selectTab(item.id)}>{item.label}</button>)}
      </nav>

      {initialTab === "profile" && <div className={s.profile__profileLayout}>
        <div className={s.profile__mainColumn}>
          <section className={s.profile__card}>
            <SectionHeading title="Основная информация" subtitle="Ваши личные данные в Workspace AI" />
            <div className={s.profile__profileFormLayout}>
              <div className={s.profile__photoColumn}>
                <button type="button" className={s.profile__avatarButton} aria-label="Выбрать фотографию" onClick={() => fileRef.current?.click()}>
                  {draft.avatarUrl ? <Image src={draft.avatarUrl} alt="Фото профиля" fill unoptimized sizes="112px" /> : <span>{draft.name.trim().slice(0, 1).toUpperCase() || "R"}</span>}
                  <i><Camera /></i>
                </button>
                <input ref={fileRef} className={s.profile__fileInput} type="file" accept="image/jpeg,image/png" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
                <button className={s.profile__outlineButton} type="button" onClick={() => fileRef.current?.click()}><Camera />Изменить фото</button>
                {draft.avatarUrl && <button className={s.profile__removePhoto} type="button" onClick={() => update("avatarUrl", undefined)}><Trash2 />Удалить</button>}
                <small>JPG, PNG до 5 МБ</small>
                {photoError && <p className={s.profile__fieldError} role="alert">{photoError}</p>}
              </div>
              <div className={s.profile__fieldsGrid}>
                <label>Имя<input value={draft.name} maxLength={255} onChange={(event) => update("name", event.target.value)} /></label>
                <label>Email<input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></label>
                <label>Должность<input value={draft.jobTitle} onChange={(event) => update("jobTitle", event.target.value)} /></label>
                <label>Подразделение<input value={draft.department} onChange={(event) => update("department", event.target.value)} /></label>
                <label className={s.profile__bioField}>О себе<textarea value={draft.bio} maxLength={200} rows={3} onChange={(event) => update("bio", event.target.value)} /><small>{draft.bio.length}/200</small></label>
              </div>
            </div>
          </section>

          <section className={s.profile__card}>
            <SectionHeading title="Контактные данные" subtitle="Используются для уведомлений и важных сообщений" />
            <div className={s.profile__contactGrid}>
              <label>Рабочий email<input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></label>
              <label>Дополнительный email<input type="email" value={draft.additionalEmail} placeholder="Например, name@example.com" onChange={(event) => update("additionalEmail", event.target.value)} /></label>
            </div>
          </section>
          <div className={s.profile__saveBar}>
            {dirty && <button type="button" className={s.profile__cancelButton} onClick={() => { setDraft(savedProfile); setPhotoError(""); }}>Отменить изменения</button>}
            <button type="button" className={s.profile__primaryButton} disabled={!dirty || !draft.name.trim() || !draft.email.trim()} onClick={() => { setSavedProfile(draft); showNotice("Изменения сохранены локально"); }}>Сохранить изменения</button>
          </div>
        </div>

        <aside className={s.profile__contextColumn}>
          <section className={s.profile__sideCard}>
            <div className={s.profile__workspaceTitle}><span><Building2 /></span><div><h2>Рабочее пространство</h2><p>{workspaceFixture.name}</p></div><em>Текущее</em></div>
            <ActionButton icon={Building2} onClick={() => selectTab("workspace")}>Переключить пространство</ActionButton>
          </section>
          <section className={s.profile__sideCard}>
            <h2>Аккаунт</h2>
            <dl className={s.profile__accountRows}>
              <div><dt><CalendarDays />Дата создания</dt><dd>{accountFixture.createdAt}</dd></div>
              <div><dt><Clock3 />Последний вход</dt><dd>{accountFixture.lastLoginAt}</dd></div>
              <div><dt><ShieldCheck />Роль</dt><dd>{accountFixture.role}</dd></div>
            </dl>
          </section>
          <section className={s.profile__sideCard}>
            <h2>Быстрые действия</h2>
            <div className={s.profile__actionList}>
              <ActionButton icon={KeyRound} onClick={() => setDialog("password")}>Сменить пароль</ActionButton>
              <ActionButton icon={FileText} onClick={() => showNotice("Управление данными пока работает в демо-режиме")}>Управление данными</ActionButton>
              <ActionButton icon={Download} onClick={() => showNotice("Экспорт данных подготовлен (демо)")}>Экспортировать данные</ActionButton>
            </div>
          </section>
          <section className={`${s.profile__sideCard} ${s.profile__helpCard}`}>
            <div><LifeBuoy /><span><h2>Нужна помощь?</h2><p>Обратитесь к администратору рабочего пространства или в поддержку.</p></span></div>
            <ActionButton icon={LifeBuoy} onClick={() => showNotice("Канал поддержки пока не подключён")}>Написать в поддержку</ActionButton>
          </section>
        </aside>
      </div>}

      {initialTab === "workspace" && <div className={s.profile__tabContent}>
        <SectionHeading title="Рабочее пространство" subtitle="Информация о текущем пространстве и доступе" />
        <section className={`${s.profile__card} ${s.profile__workspaceCard}`}>
          <div className={s.profile__workspaceHero}><span><Building2 /></span><div><h3>{workspaceFixture.name}</h3><p>Личное пространство</p></div><em>Текущее</em></div>
          <div className={s.profile__workspaceDetails}><div><span>Тип</span><strong>Личное</strong></div><div><span>Роль</span><strong>{workspaceFixture.role}</strong></div><div><span>Дата присоединения</span><strong>{workspaceFixture.joinedAt}</strong></div></div>
          <p className={s.profile__scopeText}>Это пространство используется для ваших файлов, календаря, финансов и памяти.</p>
        </section>
        <section className={s.profile__card}>
          <SectionHeading title="Сводка пространства" subtitle="Основные данные в текущем пространстве" />
          <div className={s.profile__metrics}>
            <div><FileText /><span>Документы</span><strong>{workspaceFixture.documentsCount}</strong></div>
            <div><CalendarDays /><span>События</span><strong>{workspaceFixture.eventsCount}</strong></div>
            <div><Database /><span>Факты в памяти</span><strong>{workspaceFixture.memoryFactsCount}</strong></div>
            <div><Link2 /><span>Источники данных</span><strong>{workspaceFixture.sourcesCount}</strong></div>
          </div>
        </section>
        <section className={s.profile__card}>
          <SectionHeading title="Управление пространством" subtitle="Доступные действия для текущей роли" />
          <div className={s.profile__inlineActions}><button className={s.profile__outlineButton} type="button" onClick={() => showNotice("Другие пространства пока не подключены")}>Переключить пространство</button>{user.role === "admin" && <button className={s.profile__outlineButton} type="button" onClick={() => showNotice("Управление участниками пока не подключено")}><UsersRound />Управление участниками</button>}</div>
        </section>
      </div>}

      {initialTab === "security" && <div className={s.profile__tabContent}>
        <SectionHeading title="Безопасность" subtitle="Управление доступом к вашему аккаунту" />
        <section className={s.profile__securityCard}><div><KeyRound /><span><h3>Пароль</h3><p>Регулярно обновляйте пароль для защиты аккаунта.</p></span></div><button className={s.profile__outlineButton} type="button" onClick={() => setDialog("password")}>Сменить пароль</button></section>
        <section className={s.profile__securityCard}><div><ShieldCheck /><span><h3>Активный сеанс</h3><p>Текущее устройство · {deviceLabel}</p><small>Последняя активность: сейчас</small></span></div><em>Активен</em></section>
        <section className={s.profile__securityCard}><div><Clock3 /><span><h3>Другие сеансы</h3><p>Других активных сеансов нет</p></span></div><button className={s.profile__outlineButton} type="button" onClick={() => setDialog("sessions")}>Завершить другие сеансы</button></section>
        <section className={s.profile__securityCard}><div><UserRound /><span><h3>Вход в аккаунт</h3><p>{savedProfile.email}</p><small>Последний вход: {accountFixture.lastLoginAt}</small></span></div></section>
        <section className={s.profile__securityCard}><div><LogOut /><span><h3>Выйти из аккаунта</h3><p>Завершить текущий сеанс на этом устройстве.</p></span></div><button className={s.profile__logoutButton} type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? "Выходим…" : "Выйти"}</button></section>
      </div>}

      {notice && <div className={s.profile__notice} role="status"><Check />{notice}</div>}
      {dialog === "password" && <Dialog title="Сменить пароль" onClose={() => setDialog(null)}><form className={s.profile__dialogForm} onSubmit={(event) => { event.preventDefault(); setDialog(null); showNotice("Демо: пароль не был изменён"); }}><label>Текущий пароль<input type="password" required /></label><label>Новый пароль<input type="password" minLength={8} required /></label><label>Повторите новый пароль<input type="password" minLength={8} required /></label><div className={s.profile__dialogActions}><button className={s.profile__cancelButton} type="button" onClick={() => setDialog(null)}>Отмена</button><button className={s.profile__primaryButton} type="submit">Сохранить</button></div></form></Dialog>}
      {dialog === "sessions" && <Dialog title="Завершить другие сеансы?" onClose={() => setDialog(null)}><p className={s.profile__dialogText}>В демонстрационном режиме реальные сеансы не будут изменены.</p><div className={s.profile__dialogActions}><button className={s.profile__cancelButton} type="button" onClick={() => setDialog(null)}>Отмена</button><button className={s.profile__primaryButton} type="button" onClick={() => { setDialog(null); showNotice("Демо: активные сеансы не изменены"); }}>Подтвердить</button></div></Dialog>}
    </main>
  );
}
