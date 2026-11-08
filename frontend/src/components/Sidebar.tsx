import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "@/lib/auth-types";
import { useHistoryChats } from "@/features/history-v2/hooks/useHistoryChats";
import { useHistoryMutations } from "@/features/history-v2/hooks/useHistoryMutations";
import {
  Brain,
  Building2,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  LogOut,
  Mail,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Settings,
  UserRound,
  Wallet,
} from "lucide-react";
import s from "./Workspace.module.css";
import { ThemeToggle } from "./ThemeToggle";

export type WorkspaceSection =
  | "giga"
  | "mail"
  | "calendar"
  | "tasks"
  | "documents"
  | "finance"
  | "memory"
  | "history"
  | "settings"
  | "profile";

export function GigaMark() {
  return (
    <svg
      viewBox="4 4 24 24"
      aria-hidden="true"
      className={s.workspace__giga}
    >
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M8 8h16v16H8z M8 14h16 M14 14v10" />
    </svg>
  );
}

type SidebarProps = {
  active: WorkspaceSection;
  onSection: (value: WorkspaceSection) => void;
  user: AuthUser;
  onLogout: () => void;
  loggingOut: boolean;
  collapsed: boolean;
  mobile: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onProfile: (tab: "profile" | "workspace") => void;
  onNewChat: () => void;
  activeChatId: string;
  onChat: (chatId: string) => void;
};

export function Sidebar({
  active,
  onSection,
  user,
  onLogout,
  loggingOut,
  collapsed,
  mobile,
  mobileOpen,
  onToggleCollapsed,
  onProfile,
  onNewChat,
  activeChatId,
  onChat,
}: SidebarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(true);
  const [chatHistoryExpanded, setChatHistoryExpanded] = useState(true);

  const { chats } = useHistoryChats();
  const historyMutations = useHistoryMutations();
  const profileRef = useRef<HTMLDivElement>(null);

  const gigaActive = active === "giga" && (!activeChatId || collapsed);

  const pinnedChats = useMemo(
    () =>
      chats
        .filter((chat) => chat.pinned && !chat.archived)
        .slice(0, 6),
    [chats],
  );

  const recentChats = useMemo(
    () =>
      chats
        .filter((chat) => !chat.archived && !chat.pinned)
        .sort(
          (left, right) =>
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        )
        .slice(0, 5),
    [chats],
  );

  const appItems: [typeof Brain, WorkspaceSection, string][] = [
    [Wallet, "finance", "Финансы"],
    [Mail, "mail", "Почта"],
    [CalendarDays, "calendar", "Календарь"],
    [CheckSquare2, "tasks", "Задачи"],
    [FileText, "documents", "Документы"],
    [Brain, "memory", "Память"],
  ];

  useEffect(() => {
    if (!profileOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeEscape);

    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, [profileOpen]);

  return (
    <aside id="workspace-navigation" className={s.workspace__sidebar} role={mobile && mobileOpen ? "dialog" : undefined} aria-modal={mobile && mobileOpen ? true : undefined} aria-label="Навигация по разделам" inert={mobile && !mobileOpen}>
      <div className={s.workspace__sidebarTop}>
        <div className={s.workspace__logo} aria-label="Workspace AI">
          <strong>Workspace</strong>
          <span>AI</span>
        </div>

        <button
          className={s.workspace__sidebarToggle}
          type="button"
          aria-label={
            mobile ? "Закрыть меню" : collapsed
              ? "Развернуть боковую панель"
              : "Свернуть боковую панель"
          }
          title={
            mobile ? "Закрыть меню" : collapsed
              ? "Развернуть боковую панель"
              : "Свернуть боковую панель"
          }
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>

      <nav aria-label="Основная навигация">
        <button
          className={s.workspace__newChatControl}
          type="button"
          aria-label="Новый чат"
          title={collapsed ? "Новый чат" : undefined}
          onClick={onNewChat}
        >
          <Plus aria-hidden="true" />
          <span className={s.workspace__navLabelText}>
            Новый чат
          </span>
        </button>

        <button
          className={`${s.workspace__navItem} ${s.workspace__gigaNavItem} ${
            gigaActive ? s["workspace__gigaNavItem--active"] : ""
          }`}
          type="button"
          onClick={() => onSection("giga")}
          aria-current={gigaActive ? "page" : undefined}
          aria-label="Assistant"
          title={collapsed ? "Assistant" : undefined}
        >
          <GigaMark />
          <span className={s.workspace__navLabelText}>
            Assistant
          </span>
          <ChevronRight aria-hidden="true" />
        </button>

        <button
          className={s.workspace__appGroupToggle}
          type="button"
          onClick={() => setAppsOpen((value) => !value)}
          aria-expanded={appsOpen}
          aria-label="Приложения"
        >
          <span className={s.workspace__navLabelText}>
            Приложения
          </span>
          <ChevronDown
            className={
              appsOpen
                ? s["workspace__chevron--expanded"]
                : ""
            }
            aria-hidden="true"
          />
        </button>

        <div
          className={`${s.workspace__navList} ${
            appsOpen || collapsed
              ? ""
              : s["workspace__navList--collapsed"]
          }`}
          aria-hidden={!appsOpen && !collapsed}
        >
          {appItems.map(([Icon, value, label]) => (
            <button
              className={`${s.workspace__navItem} ${
                s.workspace__sectionNavItem
              } ${
                active === value
                  ? s["workspace__navItem--active"]
                  : ""
              }`}
              key={value}
              type="button"
              onClick={() => onSection(value)}
              aria-current={
                active === value ? "page" : undefined
              }
              aria-label={label}
              title={collapsed ? label : undefined}
            >
              <span
                className={s.workspace__navActiveSurface}
                aria-hidden="true"
              />
              <Icon aria-hidden="true" />
              <span className={s.workspace__navLabelText}>
                {label}
              </span>
            </button>
          ))}
        </div>

        <div className={s.workspace__historyDivider} />

        <button
          className={s.workspace__historyHeading}
          type="button"
          aria-expanded={chatHistoryExpanded}
          onClick={() =>
            setChatHistoryExpanded((value) => !value)
          }
        >
          <span className={s.workspace__navLabelText}>
            История чатов
          </span>
          <ChevronDown
            className={
              chatHistoryExpanded
                ? s["workspace__historyChevron--expanded"]
                : ""
            }
            aria-hidden="true"
          />
        </button>

        <div
          className={`${s.workspace__historyList} ${
            chatHistoryExpanded || collapsed
              ? ""
              : s["workspace__historyList--collapsed"]
          }`}
          aria-hidden={!chatHistoryExpanded && !collapsed}
        >
          <button
            className={`${s.workspace__allChats} ${
              active === "history"
                ? s["workspace__sidebarTool--active"]
                : ""
            }`}
            type="button"
            aria-label="Все чаты"
            title={collapsed ? "Все чаты" : undefined}
            aria-current={
              active === "history" ? "page" : undefined
            }
            onClick={() => onSection("history")}
          >
            <Clock aria-hidden="true" />
            <span className={s.workspace__navLabelText}>
              Все чаты
            </span>
          </button>

          {pinnedChats.length > 0 && (
            <div className={s.workspace__historyGroup}>
              <Pin aria-hidden="true" />
              <span>Закреплённые</span>
            </div>
          )}

          {pinnedChats.map((chat) => (
            <div
              className={s.workspace__historyChatRow}
              key={chat.id}
            >
              <button
                className={`${s.workspace__historyChatOpen} ${
                  chat.id === activeChatId
                    ? s["workspace__historyChat--active"]
                    : ""
                }`}
                type="button"
                onClick={() => onChat(chat.id)}
                title={chat.title}
                aria-current={
                  chat.id === activeChatId
                    ? "page"
                    : undefined
                }
              >
                <MessageSquare aria-hidden="true" />
                <span>{chat.title}</span>
              </button>

              <button
                className={`${s.workspace__historyPin} ${
                  s["workspace__historyPin--active"]
                }`}
                type="button"
                aria-label={`Открепить чат «${chat.title}»`}
                title="Открепить"
                disabled={
                  historyMutations.status === "pending"
                }
                onClick={() =>
                  void historyMutations.setPinned(
                    chat.id,
                    false,
                  )
                }
              >
                <Pin aria-hidden="true" />
              </button>
            </div>
          ))}

          {recentChats.map((chat) => (
            <div
              className={s.workspace__historyChatRow}
              key={chat.id}
            >
              <button
                className={`${s.workspace__historyChatOpen} ${
                  chat.id === activeChatId
                    ? s["workspace__historyChat--active"]
                    : ""
                }`}
                type="button"
                onClick={() => onChat(chat.id)}
                title={chat.title}
                aria-current={
                  chat.id === activeChatId
                    ? "page"
                    : undefined
                }
              >
                <MessageSquare aria-hidden="true" />
                <span>{chat.title}</span>
              </button>

              <button
                className={s.workspace__historyPin}
                type="button"
                aria-label={`Закрепить чат «${chat.title}»`}
                title="Закрепить"
                disabled={
                  historyMutations.status === "pending"
                }
                onClick={() =>
                  void historyMutations.setPinned(
                    chat.id,
                    true,
                  )
                }
              >
                <Pin aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </nav>

      <div
        className={s.workspace__sidebarBottom}
        ref={profileRef}
      >
        {profileOpen && (
          <div
            className={s.workspace__profileMenu}
            role="menu"
          >
            <div
              className={s.workspace__profileMenuIdentity}
            >
              <span
                className={s.workspace__profileMenuAvatar}
              >
                {user.full_name
                  .trim()
                  .slice(0, 1)
                  .toUpperCase()}
              </span>

              <span>
                <strong>{user.full_name}</strong>
                <small>Личное пространство</small>
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setProfileOpen(false);
                onProfile("profile");
              }}
            >
              <UserRound aria-hidden="true" />
              <span>Мой профиль</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setProfileOpen(false);
                onProfile("workspace");
              }}
            >
              <Building2 aria-hidden="true" />
              <span>Управление пространствами</span>
            </button>

            <div
              className={s.workspace__profileMenuDivider}
            />

            <button
              className={s.workspace__profileMenuLogout}
              type="button"
              role="menuitem"
              onClick={onLogout}
              disabled={loggingOut}
            >
              <LogOut aria-hidden="true" />
              <span>
                {loggingOut
                  ? "Выходим..."
                  : "Выйти из аккаунта"}
              </span>
            </button>
          </div>
        )}

        <div className={s.workspace__sideDivider} />

        <div className={s.workspace__sidebarTools}>
          <button
            className={
              active === "settings"
                ? s["workspace__sidebarTool--active"]
                : undefined
            }
            type="button"
            aria-label="Настройки"
            title={collapsed ? "Настройки" : undefined}
            onClick={() => onSection("settings")}
            aria-current={
              active === "settings"
                ? "page"
                : undefined
            }
          >
            <Settings aria-hidden="true" />
            <span>Настройки</span>
          </button>

          <ThemeToggle appearance="sidebar" />
        </div>

        <div className={s.workspace__sideDivider} />

        <button
          className={`${s.workspace__profile} ${
            active === "profile"
              ? s["workspace__sidebarTool--active"]
              : ""
          }`}
          type="button"
          onClick={() =>
            setProfileOpen((value) => !value)
          }
          aria-expanded={profileOpen}
          aria-label="Профиль пользователя"
          title={
            collapsed
              ? "Профиль пользователя"
              : undefined
          }
        >
          <span className={s.workspace__avatar}>
            {user.full_name
              .trim()
              .slice(0, 1)
              .toUpperCase()}
          </span>

          <span>
            <strong>{user.full_name}</strong>
            <small>Личное пространство</small>
          </span>

          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
