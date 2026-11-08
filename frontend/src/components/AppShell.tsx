"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { initialSources, type Source } from "@/lib/demo";
import type { AuthUser } from "@/lib/auth-types";
import { Sidebar, WorkspaceSection } from "./Sidebar";
import { ConversationContextPanel, SourcePicker, type SourceCategory } from "./Sources";
import { CalendarScreen } from "./CalendarScreen";
import { DocumentsScreen } from "./DocumentsScreen";
import { FinanceScreen } from "./FinanceScreen";
import { TasksScreen } from "./TasksScreen";
import { ChatScreen } from "./ChatScreen";
import { SettingsScreen } from "./SettingsScreen";
import { ProfileScreen, type ProfileTab } from "./ProfileScreen";
import { TrackedTopicsScreen } from "./TrackedTopicsScreen";
import { MailScreen } from "./MailScreen";
import { useRouter, useSearchParams } from "next/navigation";
import { createChat } from "@/lib/chats";
import { HistoryV2 } from "@/features/history-v2/HistoryV2";
import { historyStore } from "@/features/history-v2/api/historyStore";
import s from "./Workspace.module.css";
import { useDialogFocus } from "./useDialogFocus";

const subscribeNarrow = (callback: () => void) => {
  const media = window.matchMedia("(max-width:1000px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const workspaceSections = new Set<WorkspaceSection>(["giga", "mail", "calendar", "tasks", "documents", "finance", "memory", "history", "settings", "profile"]);
const SIDEBAR_COLLAPSED_KEY = "restore-agent:sidebar:collapsed";
const SIDEBAR_COLLAPSED_EVENT = "restore-agent:sidebar:collapsed-change";
const subscribeSidebarCollapsed = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_COLLAPSED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, callback);
  };
};
const readSidebarCollapsed = () => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";

export function AppShell({
  user,
  onLogout,
  loggingOut,
  initialSection = "giga",
  initialProfileTab = "profile",
  initialChatId = "",
}: {
  user: AuthUser;
  onLogout: () => void;
  loggingOut: boolean;
  initialSection?: WorkspaceSection;
  initialProfileTab?: ProfileTab;
  initialChatId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia("(max-width:1000px)").matches,
    () => false,
  );
  const [profileTab, setProfileTab] = useState<ProfileTab>(initialProfileTab);
  const [mobileNav, setMobileNav] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const navOpen = narrow && mobileNav;
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebarCollapsed, readSidebarCollapsed, () => false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextRequested, setContextRequested] = useState(false);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [pickerCategory, setPickerCategory] = useState<SourceCategory>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const requestedChatId = searchParams.get("chat") ?? initialChatId;
  const routeSection = searchParams.get("section");
  const section: WorkspaceSection = requestedChatId ? "giga" : routeSection === "google-calendar" ? "calendar" : routeSection && workspaceSections.has(routeSection as WorkspaceSection) ? routeSection as WorkspaceSection : initialSection;
  const showContext = section === "giga" && contextOpen && (!narrow || contextRequested);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const syncTriggers = () => {
      for (const trigger of shell.querySelectorAll<HTMLButtonElement>('button[aria-label="Открыть меню"]')) {
        trigger.setAttribute("aria-controls", "workspace-navigation");
        trigger.setAttribute("aria-expanded", String(navOpen));
      }
    };
    syncTriggers();
    // Mail mounts its header after checking accounts; keep that trigger in sync too.
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches('button[aria-label="Открыть меню"]') || node.querySelector('button[aria-label="Открыть меню"]'))))) syncTriggers();
    });
    observer.observe(shell, { childList: true, subtree: true });
    if (!navOpen) return () => observer.disconnect();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = [...shell.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element.id !== "workspace-navigation" && !element.classList.contains(s.workspace__navBackdrop));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    return () => {
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
    };
  }, [navOpen, section]);
  useEffect(() => {
    if (!narrow && mobileNav) queueMicrotask(() => setMobileNav(false));
  }, [narrow, mobileNav]);
  useDialogFocus(navOpen, "#workspace-navigation", () => setMobileNav(false), 'button[aria-label="Открыть меню"]');

  const openChat = useCallback((chatId: string, mode: "push" | "replace" = "push") => {
    setMobileNav(false);
    const href = `/workspace?chat=${encodeURIComponent(chatId)}`;
    if (mode === "replace") router.replace(href);
    else router.push(href);
  }, [router]);

  function navigate(nextSection: WorkspaceSection) {
    setMobileNav(false);
    if (nextSection === "profile") router.push("/profile");
    else if (nextSection === "mail") router.push("/mail");
    else router.push(nextSection === "giga" ? "/workspace" : `/workspace?section=${nextSection}`);
  }

  function openPicker(category: SourceCategory) {
    setPickerCategory(category);
    setPickerOpen(true);
  }

  function openSource(source: Source) {
    setPickerOpen(false);
    if (source.kind === "mail") navigate("mail");
    else if (source.kind === "calendar") navigate("calendar");
    else if (source.kind === "memory") navigate("memory");
    else if (source.kind === "finance") navigate("finance");
    else if (source.targetId) {
      router.push(`/workspace?section=documents&document=${encodeURIComponent(source.targetId)}`);
    } else navigate("documents");
  }

  async function createAndOpenChat() {
    const chat = await createChat();
    historyStore.upsert(chat);
    openChat(chat.id);
    return chat;
  }

  return (
    <div
      ref={shellRef}
      className={`${s.workspace} ${showContext ? "" : s["workspace--contextClosed"]} ${section === "finance" || section === "calendar" || section === "documents" || section === "mail" || section === "settings" || section === "profile" ? s["workspace--wide"] : ""} ${section === "calendar" ? s["workspace--calendar"] : ""} ${sidebarCollapsed && !narrow ? s["workspace--sidebarCollapsed"] : ""} ${navOpen ? s["workspace--navOpen"] : ""}`}
    >
      <Sidebar
        active={section}
        user={user}
        onLogout={onLogout}
        loggingOut={loggingOut}
        collapsed={sidebarCollapsed && !narrow}
        mobile={narrow}
        mobileOpen={navOpen}
        onToggleCollapsed={() => {
          if (narrow) { setMobileNav(false); return; }
          window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!sidebarCollapsed));
          window.dispatchEvent(new Event(SIDEBAR_COLLAPSED_EVENT));
        }}
        onProfile={(tab) => {
          setProfileTab(tab);
          setMobileNav(false);
          router.push(tab === "workspace" ? "/profile?tab=workspace" : "/profile");
        }}
        onSection={navigate}
        activeChatId={requestedChatId}
        onChat={openChat}
        onNewChat={() => {
          setMobileNav(false);
          void createAndOpenChat();
        }}
      />
      {navOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className={s.workspace__navBackdrop}
          aria-label="Закрыть меню"
          onClick={() => setMobileNav(false)}
        />
      )}
      {section === "calendar" ? (
        <CalendarScreen onMenu={() => setMobileNav(!mobileNav)} />
      ) : section === "tasks" ? (
        <TasksScreen onMenu={() => setMobileNav(!mobileNav)} />
      ) : section === "finance" ? (
        <FinanceScreen onMenu={() => setMobileNav(!mobileNav)} />
      ) : section === "documents" ? (
        <DocumentsScreen onMenu={() => setMobileNav(!mobileNav)} onAnalyze={(document) => {
          setSources((current) => current.some((source) => source.id === `document-${document.id}`) ? current : [...current, { id: `document-${document.id}`, kind: "document", targetId: document.id, title: document.filename, description: "Документ из рабочего пространства" }]);
          navigate("giga");
        }} />
      ) : section === "settings" ? (
        <SettingsScreen
          user={user}
          onMenu={() => setMobileNav(!mobileNav)}
          onOpenMemory={() => navigate("memory")}
        />
      ) : section === "profile" ? (
        <ProfileScreen
          user={user}
          initialTab={profileTab}
          onTabChange={(tab) => {
            setProfileTab(tab);
            router.replace(tab === "profile" ? "/profile" : `/profile?tab=${tab}`);
          }}
          onMenu={() => setMobileNav(!mobileNav)}
          onLogout={onLogout}
          loggingOut={loggingOut}
        />
      ) : section === "history" ? (
        <HistoryV2
          onMenu={() => setMobileNav(!mobileNav)}
          onNewChat={createAndOpenChat}
          onOpenChat={openChat}
        />
      ) : section === "memory" ? (
        <TrackedTopicsScreen
          initialContextId={searchParams.get("context") ?? undefined}
          overlayOpen={pickerOpen}
          onMenu={() => setMobileNav(!mobileNav)}
          onCreateChat={createAndOpenChat}
          onOpenChat={(chat) => { historyStore.upsert(chat); openChat(chat.id); }}
          onOpenSources={() => openPicker("all")}
        />
      ) : section === "mail" ? (
        <MailScreen onMenu={() => setMobileNav(!mobileNav)} />
      ) : (
        <ChatScreen
          timeZone={user.timezone}
          onMenu={() => setMobileNav(!mobileNav)}
          contextOpen={showContext}
          onContext={() => {
            setContextOpen(true);
            setContextRequested(true);
          }}
          sources={sources}
          onRemoveSource={(source) => setSources((current) => current.filter((item) => item.id !== source.id))}
          onOpenSourcePicker={openPicker}
          requestedChatId={requestedChatId}
          onOpenMemoryContext={(contextId) => router.push(`/workspace?section=memory&context=${encodeURIComponent(contextId)}`)}
          onBack={() => router.back()}
          onChatCreated={(chat) => {
            historyStore.upsert(chat);
            openChat(chat.id);
          }}
        />
      )}
      {showContext && (
        <ConversationContextPanel
          sources={sources}
          onClose={() => setContextOpen(false)}
          onAdd={() => openPicker("all")}
          onOpen={openSource}
          onRemove={(source) => setSources((current) => current.filter((item) => item.id !== source.id))}
        />
      )}
      <SourcePicker
        open={pickerOpen}
        returnFocusSelector={section === "memory" ? "[data-memory-sources]" : undefined}
        category={pickerCategory}
        attached={sources}
        onCategoryChange={setPickerCategory}
        onAttach={(source) => { setSources((current) => current.some((item) => item.id === source.id) ? current : [...current, source]); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
