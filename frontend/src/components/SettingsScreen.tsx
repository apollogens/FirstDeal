"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  FileText,
  FlaskConical,
  Link2,
  Mail,
  Menu,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import type { AuthUser } from "@/lib/auth-types";
import {
  exportProfile,
  getDatasets,
  resetDatasets,
  runDatasetBenchmark,
  uploadDataset,
  type BenchmarkReport,
  type Dataset,
  type DatasetSourceType,
} from "@/lib/datasets";
import {
  getIntegrationsStatus,
  type IntegrationRegistryResponse,
  type IntegrationStatus,
} from "@/lib/integrations";
import { getVersionInfo, type VersionInfo } from "@/lib/version";
import { createTelegramLink, disconnectTelegram, getTelegramConnection, type TelegramConnection } from "@/lib/telegram";
import { subscribeUserEvents } from "@/lib/user-events";
import { RestoreSelect, type SelectOption } from "./RestoreSelect";
import { SegmentedControl } from "./SegmentedControl";
import {
  applyThemeMode,
  readThemeMode,
  THEME_EVENT,
  type ThemeMode,
} from "./ThemeToggle";
import s from "./Settings.module.css";

type SettingsSection = "general" | "assistant" | "notifications" | "data" | "integrations";
type ResponseDetail = "short" | "normal" | "detailed";
type WorkspaceScope = "personal" | "work";
type Timezone = "Europe/Moscow" | "Europe/Berlin" | "Europe/London" | "America/New_York" | "Asia/Tokyo";

type SettingsState = {
  theme: ThemeMode;
  timezone: Timezone;
  defaultScope: WorkspaceScope;
  responseDetail: ResponseDetail;
  memoryEnabled: boolean;
  autoMemoryExtraction: boolean;
  confirmImportantActions: boolean;
  confirmDeletion: boolean;
  notifications: {
    calendar: boolean;
    documents: boolean;
    agentActions: boolean;
    integrationErrors: boolean;
    weeklySummary: boolean;
  };
};

const initialSettings: SettingsState = {
  theme: "light",
  timezone: "Europe/Moscow",
  defaultScope: "personal",
  responseDetail: "normal",
  memoryEnabled: true,
  autoMemoryExtraction: true,
  confirmImportantActions: true,
  confirmDeletion: true,
  notifications: {
    calendar: true,
    documents: true,
    agentActions: true,
    integrationErrors: true,
    weeklySummary: false,
  },
};

const timezones: SelectOption<Timezone>[] = [
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Berlin", label: "Берлин (UTC+2)" },
  { value: "Europe/London", label: "Лондон (UTC+1)" },
  { value: "America/New_York", label: "Нью-Йорк (UTC-4)" },
  { value: "Asia/Tokyo", label: "Токио (UTC+9)" },
];

const datasetSources: SelectOption<DatasetSourceType>[] = [
  { value: "email", label: "Почта" },
  { value: "telegram", label: "Telegram" },
  { value: "calendar", label: "Календарь" },
  { value: "mixed_jsonl", label: "Смешанный JSONL" },
];

const navItems = [
  { id: "general", label: "Общие", icon: SlidersHorizontal },
  { id: "assistant", label: "Ассистент", icon: Brain },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "data", label: "Данные и доступ", icon: ShieldCheck },
  { id: "integrations", label: "Интеграции", icon: Link2 },
] as const;

function getStatusBadge(status: IntegrationStatus) {
  switch (status) {
    case "healthy":
      return <span className={s.settings__badgeHealthy}><CheckCircle2 size={13} /> Активна</span>;
    case "degraded":
      return <span className={s.settings__badgeDegraded}><AlertCircle size={13} /> Деградирована</span>;
    case "configured":
      return <span className={s.settings__badgeConfigured}><CheckCircle2 size={13} /> Настроена</span>;
    default:
      return <span className={s.settings__badgeUnconfigured}><AlertCircle size={13} /> Не настроена</span>;
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "mail":
      return <Mail size={18} />;
    case "finance":
      return <TrendingUp size={18} />;
    default:
      return <FileText size={18} />;
  }
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${s.settings__switch} ${checked ? s.settings__switchOn : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className={s.settings__settingRow}>
      <div><strong>{title}</strong>{description && <p>{description}</p>}</div>
      <div className={s.settings__settingControl}>{children}</div>
    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={dialogRef} aria-label={title} className={s.settings__dialog} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={s.settings__dialogPanel}>
        <div className={s.settings__dialogHeader}><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Закрыть"><X /></button></div>
        {children}
      </div>
    </dialog>
  );
}

export function SettingsScreen({ user, onMenu, onOpenMemory }: { user: AuthUser; onMenu: () => void; onOpenMemory: () => void }) {
  const [telegramConnection, setTelegramConnection] = useState<TelegramConnection | null>(null);
  const [telegramLink, setTelegramLink] = useState("");
  const [telegramError, setTelegramError] = useState("");
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [active, setActive] = useState<SettingsSection>("general");
  const [settings, setSettings] = useState<SettingsState>(initialSettings);
  const [profile, setProfile] = useState({ name: user.full_name || "Пользователь", email: user.email || "" });
  const [profileDraft, setProfileDraft] = useState(profile);
  const [dialog, setDialog] = useState<"profile" | "sessions" | "password" | "delete" | null>(null);
  const [notice, setNotice] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetSource, setDatasetSource] = useState<DatasetSourceType>("email");
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [datasetError, setDatasetError] = useState("");
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [integrationsData, setIntegrationsData] = useState<IntegrationRegistryResponse | null>(null);
  const [integrationsBusy, setIntegrationsBusy] = useState(false);
  const [integrationsError, setIntegrationsError] = useState("");
  const [expandedScenarios, setExpandedScenarios] = useState<Record<string, boolean>>({
    mail: true,
    finance: true,
    documents_news: true,
  });
  const [expandedSetup, setExpandedSetup] = useState<Record<string, boolean>>({});
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getVersionInfo(controller.signal)
      .then(setVersionInfo)
      .catch(() => {
        if (!controller.signal.aborted) setVersionInfo(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const syncTheme = () => setSettings((current) => ({ ...current, theme: readThemeMode() }));
    syncTheme();
    window.addEventListener(THEME_EVENT, syncTheme);
    return () => {
      window.removeEventListener(THEME_EVENT, syncTheme);
    };
  }, []);

  useEffect(() => {
    if (active !== "data") return;
    const controller = new AbortController();
    getDatasets(controller.signal)
      .then(setDatasets)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDatasetError(error instanceof Error ? error.message : "Не удалось загрузить наборы данных.");
      });
    return () => controller.abort();
  }, [active]);

  const loadIntegrations = async (signal?: AbortSignal) => {
    setIntegrationsBusy(true);
    setIntegrationsError("");
    try {
      const data = await getIntegrationsStatus(signal);
      setIntegrationsData(data);
    } catch (error: unknown) {
      if (!signal?.aborted) {
        setIntegrationsError(error instanceof Error ? error.message : "Не удалось загрузить статус интеграций.");
      }
    } finally {
      if (!signal?.aborted) {
        setIntegrationsBusy(false);
      }
    }
  };

  useEffect(() => {
    if (active !== "integrations") return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const state = await getTelegramConnection(controller.signal);
        if (!controller.signal.aborted) { setTelegramConnection(state); setTelegramError(""); setTelegramLoading(false); }
      } catch (error) {
        if (!controller.signal.aborted) { setTelegramError(error instanceof Error ? error.message : "Не удалось загрузить Telegram."); setTelegramLoading(false); }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    const unsubscribe = subscribeUserEvents((event) => {
      if (event.event === "telegram.connected" || event.event === "telegram.disconnected") void refresh();
    });
    return () => { controller.abort(); window.clearInterval(timer); unsubscribe(); };
  }, [active]);

  const makeTelegramLink = async (purpose: "private" | "group") => {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setTelegramBusy(true);
    setTelegramError("");
    try {
      const link = await createTelegramLink(purpose);
      setTelegramLink(link);
      if (tab) tab.location.href = link;
      else window.location.assign(link);
    }
    catch (error) { tab?.close(); setTelegramError(error instanceof Error ? error.message : "Не удалось создать ссылку."); }
    finally { setTelegramBusy(false); }
  };

  const removeTelegramConnection = async () => {
    setTelegramBusy(true);
    setTelegramError("");
    try {
      await disconnectTelegram();
      setTelegramConnection(await getTelegramConnection());
      setTelegramLink("");
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "Не удалось отключить Telegram.");
    } finally { setTelegramBusy(false); }
  };

  useEffect(() => {
    if (active !== "integrations") return;
    const controller = new AbortController();
    getIntegrationsStatus(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setIntegrationsData(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setIntegrationsError(error instanceof Error ? error.message : "Не удалось загрузить статус интеграций.");
        }
      });
    return () => controller.abort();
  }, [active]);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const setNotification = (key: keyof SettingsState["notifications"], value: boolean) =>
    setSettings((current) => ({ ...current, notifications: { ...current.notifications, [key]: value } }));
  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };

  async function submitDataset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!datasetFile || datasetBusy) return;
    setDatasetBusy(true);
    setDatasetError("");
    try {
      const result = await uploadDataset(datasetFile, datasetSource);
      setDatasets(await getDatasets());
      setDatasetFile(null);
      showNotice(`Импортировано записей: ${result.items_imported}, фактов: ${result.facts_extracted}`);
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Не удалось импортировать набор данных.");
    } finally {
      setDatasetBusy(false);
    }
  }

  async function evaluateDataset() {
    if (datasetBusy) return;
    setDatasetBusy(true);
    setDatasetError("");
    try {
      setBenchmark(await runDatasetBenchmark());
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Не удалось запустить проверку профиля.");
    } finally {
      setDatasetBusy(false);
    }
  }

  async function handleResetDatasets() {
    if (datasetBusy) return;
    if (!window.confirm("Вы уверены, что хотите сбросить импортированные наборы данных? Связанные факты и события календаря будут удалены.")) return;
    setDatasetBusy(true);
    setDatasetError("");
    try {
      const res = await resetDatasets();
      setDatasets(await getDatasets());
      setBenchmark(null);
      showNotice(`Рабочее пространство очищено: наборов ${res.datasets_deleted}, фактов ${res.facts_deleted}`);
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Не удалось сбросить наборы данных.");
    } finally {
      setDatasetBusy(false);
    }
  }

  async function handleExportProfile() {
    try {
      const data = await exportProfile();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profile-export-${data.user_id || "me"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotice(`Экспортировано ${data.active_facts_count} фактов профиля`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось экспортировать данные профиля");
    }
  }

  const sectionMeta: Record<SettingsSection, { title: string; subtitle: string }> = {
    general: { title: "Общие", subtitle: "Основные параметры аккаунта и рабочего пространства" },
    assistant: { title: "Ассистент", subtitle: "Настройка поведения Workspace AI" },
    notifications: { title: "Уведомления", subtitle: "Какие события Workspace AI должен показывать вам" },
    data: { title: "Данные и доступ", subtitle: "Безопасность, данные и управление аккаунтом" },
    integrations: { title: "Интеграции", subtitle: "Тематические внешние сервисы, лимиты, диагностика и сценарии жюри" },
  };

  return (
    <main className={s.settings__page}>
      <header className={s.settings__pageHeader}>
        <button className={s.settings__mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
        <div><h1>Настройки</h1><p>Аккаунт, интерфейс и поведение ассистента</p></div>
        <div className={s.settings__accountCard}>
          <span className={s.settings__avatar}>{profile.name.trim().slice(0, 1).toUpperCase() || "R"}</span>
          <span><strong>{profile.name}</strong><small>{profile.email}</small><small>Личное пространство</small></span>
        </div>
      </header>

      <div className={s.settings__workspace}>
        <nav className={s.settings__settingsNav} aria-label="Разделы настроек">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={active === id ? s.settings__navActive : ""} aria-current={active === id ? "page" : undefined} onClick={() => setActive(id)}>
              <Icon /><span>{label}</span>
            </button>
          ))}

        </nav>

        <section className={s.settings__content}>
          <div className={s.settings__sectionHeader}><h2>{sectionMeta[active].title}</h2><p>{sectionMeta[active].subtitle}</p></div>

          {active === "general" && <>
            <section className={s.settings__group}>
              <h3>Профиль</h3>
              <div className={s.settings__profileGrid}><span>Имя</span><strong>{profile.name}</strong><span>Email</span><strong>{profile.email}</strong></div>
              <button className={s.settings__secondaryButton} type="button" onClick={() => { setProfileDraft(profile); setDialog("profile"); }}>Изменить</button>
            </section>
            <section className={s.settings__group}>
              <h3>Интерфейс</h3>
              <SettingRow title="Тема" description="Выберите оформление приложения">
                <SegmentedControl ariaLabel="Тема" value={settings.theme} options={[{ value: "light", label: "Светлая" }, { value: "dark", label: "Тёмная" }, { value: "system", label: "Системная" }]} onChange={(value) => { update("theme", value); applyThemeMode(value); }} />
              </SettingRow>
              <SettingRow title="Часовой пояс">
                <div className={s.settings__selectWrap}><RestoreSelect label="Часовой пояс" showLabel={false} value={settings.timezone} options={timezones} onChange={(value) => update("timezone", value)} /></div>
              </SettingRow>
            </section>
            <section className={s.settings__group}>
              <h3>Рабочая область</h3>
              <SettingRow title="Область по умолчанию" description="Будет использоваться при создании новых записей">
                <SegmentedControl ariaLabel="Область по умолчанию" value={settings.defaultScope} options={[{ value: "personal", label: "Личное" }, { value: "work", label: "Работа" }]} onChange={(value) => update("defaultScope", value)} />
              </SettingRow>
            </section>
            <details className={s.settings__group}>
              <summary>О системе и сборке</summary>
              <div className={s.settings__profileGrid}>
                <span>Версия ассистента</span><strong>{versionInfo?.version ?? "Недоступно"}</strong>
                <span>Git Commit SHA</span><code>{versionInfo ? `${versionInfo.commit_sha} (${versionInfo.branch})` : "Недоступно"}</code>
                <span>Ревизия схемы БД</span><code>{versionInfo?.database_revision ?? "Недоступно"}</code>
                <span>Среда запуска</span><strong>{versionInfo?.environment ?? "Недоступно"}</strong>
                <span>Дата сборки</span><span>{versionInfo?.build_date ?? "Недоступно"}</span>
              </div>
            </details>
          </>}

          {active === "assistant" && <section className={s.settings__group}>
            <h3>Поведение ассистента</h3>
            <SettingRow title="Подробность ответов" description="Определяет, насколько кратко или подробно отвечает ассистент"><SegmentedControl ariaLabel="Подробность ответов" value={settings.responseDetail} options={[{ value: "short", label: "Кратко" }, { value: "normal", label: "Обычно" }, { value: "detailed", label: "Подробно" }]} onChange={(value) => update("responseDetail", value)} /></SettingRow>
            <SettingRow title="Использовать долгую память" description="Ассистент может использовать сохранённые факты о вас между сессиями"><Switch label="Использовать долгую память" checked={settings.memoryEnabled} onChange={(value) => update("memoryEnabled", value)} /></SettingRow>
            <SettingRow title="Автоматически сохранять полезные факты" description="Workspace AI сможет извлекать факты из подключённых источников"><Switch label="Автоматически сохранять полезные факты" checked={settings.autoMemoryExtraction} onChange={(value) => update("autoMemoryExtraction", value)} /></SettingRow>
            <SettingRow title="Подтверждать важные действия" description="Запрашивать подтверждение перед отправкой сообщений, созданием событий и другими внешними действиями"><Switch label="Подтверждать важные действия" checked={settings.confirmImportantActions} onChange={(value) => update("confirmImportantActions", value)} /></SettingRow>
            <SettingRow title="Подтверждать удаление" description="Показывать подтверждение перед удалением документов, памяти и других данных"><Switch label="Подтверждать удаление" checked={settings.confirmDeletion} onChange={(value) => update("confirmDeletion", value)} /></SettingRow>
          </section>}

          {active === "notifications" && <section className={s.settings__group}>
            <h3>События</h3>
            {([
              ["calendar", "Напоминания календаря", "Напоминать о предстоящих событиях и задачах"],
              ["documents", "Обработка документов", "Сообщать, когда документ обработан или произошла ошибка"],
              ["agentActions", "Действия агента", "Сообщать, когда агент предлагает или завершает действие"],
              ["integrationErrors", "Ошибки интеграций", "Предупреждать о проблемах с подключёнными источниками"],
              ["weeklySummary", "Еженедельная сводка", "Получать краткую сводку важных событий, финансов и задач"],
            ] as const).map(([key, title, description]) => <SettingRow key={key} title={title} description={description}><Switch label={title} checked={settings.notifications[key]} onChange={(value) => setNotification(key, value)} /></SettingRow>)}
          </section>}

          {active === "data" && <div className={s.settings__dataGroups}>
            <section className={s.settings__datasetGroup}>
              <div className={s.settings__datasetHeading}><span><Database /></span><div><h3>Конкурсные наборы данных</h3><p>Загрузите JSONL с почтой, Telegram или календарём. Backend обработает записи и добавит факты в память.</p></div></div>
              <form className={s.settings__datasetForm} onSubmit={(event) => { void submitDataset(event); }}>
                <div className={s.settings__datasetSelect}><RestoreSelect label="Тип источника" value={datasetSource} options={datasetSources} onChange={setDatasetSource} /></div>
                <label className={s.settings__datasetFile}><Upload /><span>{datasetFile?.name ?? "Выбрать JSONL"}</span><input type="file" accept=".jsonl,application/json" onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)} /></label>
                <button className={s.settings__primaryButton} type="submit" disabled={!datasetFile || datasetBusy}>{datasetBusy ? "Обработка…" : "Импортировать"}</button>
              </form>
              {datasetError && <p className={s.settings__datasetError} role="alert">{datasetError}</p>}
              {datasets.length > 0 && <div className={s.settings__datasetList}>{datasets.map((dataset) => <div key={dataset.id}><span><strong>{dataset.name}</strong><small>{dataset.source_type} · {dataset.items_count} записей</small></span><em>{dataset.status}</em></div>)}</div>}
              <div className={s.settings__benchmarkRow}>
                <div>
                  <h3>Проверка профиля</h3>
                  <p>{benchmark ? `Результат: ${benchmark.passed} из ${benchmark.total} (${benchmark.score_percentage}%)` : "Проверьте, что импортированные данные сформировали профиль."}</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className={s.settings__secondaryButton} type="button" disabled={datasetBusy || datasets.length === 0} onClick={() => void evaluateDataset()}><FlaskConical />Запустить</button>
                  <button className={s.settings__secondaryButton} type="button" disabled={datasetBusy || datasets.length === 0} onClick={() => void handleResetDatasets()}><Trash2 />Сбросить</button>
                </div>
              </div>
            </section>
            <section className={s.settings__actionGroup}><div><h3>Сеансы</h3><p>Вы вошли в Workspace AI на этом устройстве</p></div><button className={s.settings__secondaryButton} type="button" onClick={() => setDialog("sessions")}>Завершить другие сеансы</button></section>
            <section className={s.settings__actionGroup}><div><h3>Экспорт данных</h3><p>Скачать копию ваших данных, включая сохранённую память и настройки</p></div><button className={s.settings__secondaryButton} type="button" onClick={() => void handleExportProfile()}><Download />Экспортировать данные</button></section>
            <section className={s.settings__actionGroup}><div><h3>Данные памяти</h3><p>Управляйте фактами, которые Workspace AI сохранил о вас</p></div><button className={s.settings__secondaryButton} type="button" onClick={onOpenMemory}>Открыть память</button></section>
            <section className={s.settings__actionGroup}><div><h3>Пароль</h3><p>Обновите пароль для входа в аккаунт</p></div><button className={s.settings__secondaryButton} type="button" onClick={() => setDialog("password")}>Сменить пароль</button></section>
            <section className={`${s.settings__actionGroup} ${s.settings__dangerGroup}`}><div><h3>Удаление аккаунта</h3><p>Удаление аккаунта приведёт к удалению пользовательских данных.</p></div><button className={s.settings__dangerButton} type="button" onClick={() => setDialog("delete")}>Удалить аккаунт</button></section>
          </div>}

          {active === "integrations" && (
            <div className={s.settings__integrationsList}>
              <article className={s.settings__integrationCard}>
                <div className={s.settings__integrationHeader}>
                  <h3>Telegram</h3>
                  <span className={telegramError ? s.settings__badgeDegraded : telegramConnection?.connected ? s.settings__badgeHealthy : s.settings__badgeUnconfigured}>
                    {telegramError ? "Ошибка" : telegramConnection?.connected ? "Подключён" : "Не подключён"}
                  </span>
                </div>
                {telegramConnection?.connected ? (
                  <>
                    <p>Telegram подключён{telegramConnection.username ? ` · @${telegramConnection.username}` : ""}</p>
                    {telegramConnection.last_seen && <p>Последняя активность: {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(telegramConnection.last_seen))}</p>}
                  </>
                ) : <p>Подключите Telegram, чтобы агент мог получать контекст и отправлять вам подтверждения действий.</p>}
                <div className={s.settings__integrationTags}>
                  {telegramConnection?.connected ? <>
                    {telegramConnection.bot_url && <a className={s.settings__secondaryButton} href={telegramConnection.bot_url} target="_blank" rel="noopener noreferrer">Открыть бота</a>}
                    <button className={s.settings__secondaryButton} type="button" disabled={telegramBusy} onClick={() => void removeTelegramConnection()}>Отключить</button>
                  </> : <button className={s.settings__secondaryButton} type="button" disabled={telegramBusy || telegramLoading} onClick={() => void makeTelegramLink("private")}>Подключить Telegram</button>}
                </div>
                {telegramConnection?.connected && <>
                  <div className={s.settings__integrationTags}>
                    <button className={s.settings__secondaryButton} type="button" disabled={telegramBusy} onClick={() => void makeTelegramLink("group")}>Добавить агента в рабочую группу</button>
                  </div>
                  {(telegramConnection.groups ?? []).map((group) => <p key={group.chat_id}>Подключена группа: {group.title}</p>)}
                </>}
                {telegramLink && <p><a href={telegramLink} target="_blank" rel="noopener noreferrer">Открыть ссылку в Telegram</a> · действует 10 минут</p>}
                {telegramError && <p role="alert">{telegramError}</p>}
              </article>
              <div className={s.settings__integrationsSummary}>
                <div>
                  <h3>Статус интеграций системы</h3>
                  <p>
                    {integrationsData
                      ? <>Активно <em>{integrationsData.healthy_count} из {integrationsData.total}</em> проверенных интеграций</>
                      : "Загрузка статуса тематических интеграций..."}
                  </p>
                </div>
                <button
                  type="button"
                  className={s.settings__secondaryButton}
                  disabled={integrationsBusy}
                  onClick={() => void loadIntegrations()}
                >
                  <RefreshCw style={{ animation: integrationsBusy ? "spin 1s linear infinite" : "none" }} />
                  {integrationsBusy ? "Проверка…" : "Обновить статус"}
                </button>
              </div>

              {integrationsError && (
                <p className={s.settings__datasetError} role="alert">
                  {integrationsError}
                </p>
              )}

              {(integrationsData?.items ?? []).map((item) => {
                const isScenarioOpen = expandedScenarios[item.id] ?? false;
                const isSetupOpen = expandedSetup[item.id] ?? false;

                return (
                  <article key={item.id} className={s.settings__integrationCard}>
                    <div className={s.settings__integrationHeader}>
                      <div className={s.settings__integrationTitle}>
                        <h3>
                          {getCategoryIcon(item.category)}
                          {item.name}
                        </h3>
                        <div className={s.settings__integrationTags}>
                          <span className={s.settings__tag}>Категория: {item.category}</span>
                          <span className={s.settings__tag}>Авторизация: {item.auth_type}</span>
                        </div>
                      </div>
                      <div>{getStatusBadge(item.status)}</div>
                    </div>

                    <p className={s.settings__integrationDesc}>{item.description}</p>

                    <div className={s.settings__limitsGrid}>
                      <div className={s.settings__limitItem}>
                        <span className={s.settings__limitLabel}>Таймаут</span>
                        <span className={s.settings__limitValue}>{item.bounded_limits.timeout_seconds} сек</span>
                      </div>
                      <div className={s.settings__limitItem}>
                        <span className={s.settings__limitLabel}>Макс. размер</span>
                        <span className={s.settings__limitValue}>
                          {(item.bounded_limits.max_response_bytes / (1024 * 1024)).toFixed(1)} МБ
                        </span>
                      </div>
                      <div className={s.settings__limitItem}>
                        <span className={s.settings__limitLabel}>Повторы (retry)</span>
                        <span className={s.settings__limitValue}>{item.bounded_limits.retry_attempts}</span>
                      </div>
                      <div className={s.settings__limitItem}>
                        <span className={s.settings__limitLabel}>Кэш TTL</span>
                        <span className={s.settings__limitValue}>
                          {item.bounded_limits.cache_ttl_seconds
                            ? `${item.bounded_limits.cache_ttl_seconds} сек`
                            : "Без кэша"}
                        </span>
                      </div>
                    </div>

                    {Object.keys(item.details).length > 0 && (
                      <div className={s.settings__detailsBox}>
                        <strong>Диагностика и параметры:</strong>
                        <div className={s.settings__detailsGrid}>
                          {Object.entries(item.details).map(([k, v]) => (
                            <div key={k}>
                              <span style={{ color: "var(--text-secondary)" }}>{k}: </span>
                              <code>{typeof v === "object" ? JSON.stringify(v) : String(v)}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={s.settings__scenarioBox}>
                      <button
                        type="button"
                        className={s.settings__scenarioToggle}
                        onClick={() =>
                          setExpandedScenarios((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                      >
                        <span>Сценарий для жюри: {item.jury_scenario.title}</span>
                        {isScenarioOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isScenarioOpen && (
                        <div className={s.settings__scenarioContent}>
                          <div className={s.settings__scenarioRow}>
                            <span>Настройка (Setup):</span>
                            <div>{item.jury_scenario.setup}</div>
                          </div>
                          <div className={s.settings__scenarioRow}>
                            <span>Команда агенту:</span>
                            <code>{item.jury_scenario.command}</code>
                          </div>
                          <div className={s.settings__scenarioRow}>
                            <span>Ожидаемый результат:</span>
                            <div>{item.jury_scenario.expected_result}</div>
                          </div>
                          <div className={s.settings__scenarioRow}>
                            <span>Сквозной тест:</span>
                            <div className={s.settings__scenarioStatus}>
                              <code>{item.jury_scenario.test_file}</code>
                              <span>✓ {item.jury_scenario.test_status}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={s.settings__scenarioBox}>
                      <button
                        type="button"
                        className={s.settings__scenarioToggle}
                        onClick={() =>
                          setExpandedSetup((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                      >
                        <span>Инструкция по настройке и подключению</span>
                        {isSetupOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isSetupOpen && (
                        <div className={s.settings__setupContent}>
                          {item.setup_instructions}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {notice && <div className={s.settings__notice} role="status"><Check />{notice}</div>}
      {dialog === "profile" && <Dialog title="Редактировать профиль" onClose={() => setDialog(null)}><form className={s.settings__dialogForm} onSubmit={(event) => { event.preventDefault(); setProfile(profileDraft); setDialog(null); showNotice("Профиль обновлён локально"); }}><label>Имя<input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} required /></label><label>Email<input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} required /></label><div className={s.settings__dialogActions}><button type="button" className={s.settings__secondaryButton} onClick={() => setDialog(null)}>Отмена</button><button type="submit" className={s.settings__primaryButton}>Сохранить</button></div></form></Dialog>}
      {dialog === "sessions" && <Dialog title="Завершить другие сеансы?" onClose={() => setDialog(null)}><p className={s.settings__dialogText}>Это действие имитирует выход на других устройствах. Текущий сеанс останется активным.</p><div className={s.settings__dialogActions}><button className={s.settings__secondaryButton} type="button" onClick={() => setDialog(null)}>Отмена</button><button className={s.settings__primaryButton} type="button" onClick={() => { setDialog(null); showNotice("Другие сеансы завершены (демо)"); }}>Подтвердить</button></div></Dialog>}
      {dialog === "password" && <Dialog title="Сменить пароль" onClose={() => setDialog(null)}><form className={s.settings__dialogForm} onSubmit={(event) => { event.preventDefault(); setDialog(null); showNotice("Пароль обновлён локально (демо)"); }}><label>Текущий пароль<input type="password" required /></label><label>Новый пароль<input type="password" minLength={8} required /></label><label>Повторите пароль<input type="password" minLength={8} required /></label><div className={s.settings__dialogActions}><button type="button" className={s.settings__secondaryButton} onClick={() => setDialog(null)}>Отмена</button><button type="submit" className={s.settings__primaryButton}>Сохранить</button></div></form></Dialog>}
      {dialog === "delete" && <Dialog title="Удалить аккаунт?" onClose={() => setDialog(null)}><p className={s.settings__dialogText}>В рабочей версии это действие удалит аккаунт и данные. В демонстрации ничего удалено не будет.</p><div className={s.settings__dialogActions}><button className={s.settings__secondaryButton} type="button" onClick={() => setDialog(null)}>Отмена</button><button className={s.settings__dangerButton} type="button" onClick={() => { setDialog(null); showNotice("Удаление отключено в демо-режиме"); }}>Удалить аккаунт</button></div></Dialog>}
    </main>
  );
}
