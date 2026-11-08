"use client";

import Image from "next/image";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getContext, type ContextBundle } from "@/lib/contexts";
import { CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronUp, Copy, FileText, Info, Layers3, LoaderCircle, Mail, Menu, MessageSquare, PanelRightOpen, Paperclip, RefreshCw, Rss, WalletCards, XCircle, type LucideIcon } from "lucide-react";
import {
  cancelChatTurn,
  connectChatSocket,
  confirmChatAction,
  createChat,
  getChat,
  getChatActions,
  getChatMessages,
  getChats,
  getChatTurn,
  rejectChatAction,
  sendChatMessage,
  type Chat,
  type ChatAction,
  type ChatMessage,
  type ChatTurn,
  ChatsApiError,
} from "@/lib/chats";
import { getCategories } from "@/lib/finance";
import { ChatComposer, ContextQuickActions, type FileAttachment, type TextAttachment } from "./Composer";
import { DOCUMENT_FILE_ACCEPT, DOCUMENT_MAX_FILE_SIZE, getDocument, getDocuments, uploadDocument, type DocumentRecord } from "@/lib/documents";
import { GigaMark } from "./Sidebar";
import type { Source } from "@/lib/demo";
import type { SourceCategory } from "./Sources";
import { historyStore } from "@/features/history-v2/api/historyStore";
import { readStoredStringList } from "@/lib/browser-preferences";
import { NotificationsButton } from "./NotificationsButton";
import { ChatCitations } from "./ChatCitations";
import s from "./Workspace.module.css";

const HIDDEN_CHATS_KEY = "restore-hidden-chats-v1";
const COLLAPSED_ACTIONS_KEY = "restore-collapsed-chat-actions-v1";
const TEXT_ATTACHMENT_PATTERN = /\n?<restore-text-attachment name="([^"]+)">\n([\s\S]*?)\n<\/restore-text-attachment>/g;
const FILE_ATTACHMENT_PATTERN = /\n?<restore-document-attachment id="([^"]+)" name="([^"]+)" \/>/g;

const supportedDocumentExtensions = new Set(DOCUMENT_FILE_ACCEPT.split(","));

function decodeAttribute(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function buildMessageContent(value: string, attachments: TextAttachment[]) {
  const body = value.trim();
  const attachmentText = attachments.map((attachment) =>
    `<restore-text-attachment name="${attachment.name.replaceAll('"', "'")}">\n${attachment.content}\n</restore-text-attachment>`,
  ).join("\n\n");
  return [body, attachmentText].filter(Boolean).join("\n\n");
}

function parseUserContent(content: string) {
  const attachments: Array<{ name: string; content: string }> = [];
  const files: Array<{ id: string; name: string }> = [];
  const withoutTextAttachments = content.replace(TEXT_ATTACHMENT_PATTERN, (_, name: string, attachmentContent: string) => {
    attachments.push({ name, content: attachmentContent });
    return "";
  });
  const text = withoutTextAttachments.replace(FILE_ATTACHMENT_PATTERN, (_, id: string, name: string) => {
    files.push({ id, name: decodeAttribute(name) });
    return "";
  }).trim();
  return { text, attachments, files };
}

function mergeLogicalActions(items: ChatAction[]) {
  const merged: ChatAction[] = [];
  const indexes = new Map<string, number>();
  const statusRank: Record<ChatAction["status"], number> = { pending: 0, expired: 1, rejected: 2, executed: 2 };
  for (const item of items) {
    const keys = [`action:${item.id}`, ...(item.result_id ? [`result:${item.result_id}`] : [])];
    const existingIndex = keys.map((key) => indexes.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      const index = merged.push(item) - 1;
      keys.forEach((key) => indexes.set(key, index));
    } else {
      if (statusRank[item.status] >= statusRank[merged[existingIndex].status]) merged[existingIndex] = item;
      keys.forEach((key) => indexes.set(key, existingIndex));
    }
  }
  return merged;
}

function mergeMessages(...groups: ChatMessage[][]) {
  const byId = new Map<string, ChatMessage>();
  for (const message of groups.flat()) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

function groupActionsByMessage(messages: ChatMessage[], actions: ChatAction[]) {
  const lastMessageByTurn = new Map<string, ChatMessage>();
  const lastAssistantByTurn = new Map<string, ChatMessage>();
  for (const message of messages) {
    if (!message.turn_id) continue;
    lastMessageByTurn.set(message.turn_id, message);
    if (message.role === "assistant") lastAssistantByTurn.set(message.turn_id, message);
  }

  const actionsByMessageId = new Map<string, ChatAction[]>();
  const unassignedActions: ChatAction[] = [];
  for (const action of actions) {
    const host = lastAssistantByTurn.get(action.turn_id) ?? lastMessageByTurn.get(action.turn_id);
    if (!host) {
      unassignedActions.push(action);
      continue;
    }
    const group = actionsByMessageId.get(host.id) ?? [];
    group.push(action);
    actionsByMessageId.set(host.id, group);
  }
  return { actionsByMessageId, unassignedActions };
}

export function ChatScreen({
  onMenu,
  contextOpen,
  onContext,
  sources,
  onRemoveSource,
  onOpenSourcePicker,
  requestedChatId = "",
  onOpenMemoryContext,
  onBack,
  onChatCreated,
  timeZone,
}: {
  onMenu: () => void;
  contextOpen: boolean;
  onContext: () => void;
  sources: Source[];
  onRemoveSource: (source: Source) => void;
  onOpenSourcePicker: (category: SourceCategory) => void;
  requestedChatId?: string;
  onOpenMemoryContext: (contextId: string) => void;
  onBack: () => void;
  onChatCreated: (chat: Chat) => void;
  timeZone: string;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [linkedContext, setLinkedContext] = useState<ContextBundle | null>(null);
  const [activeChatId, setActiveChatId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [turn, setTurn] = useState<ChatTurn | null>(null);
  const [actions, setActions] = useState<ChatAction[]>([]);
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const [resolvingActionId, setResolvingActionId] = useState("");
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [bulkResolvingMessageId, setBulkResolvingMessageId] = useState("");
  const [bulkDecision, setBulkDecision] = useState<"confirm" | "reject" | "">("");
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [value, setValue] = useState("");
  const [textAttachments, setTextAttachments] = useState<TextAttachment[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [collapsedActionIds, setCollapsedActionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const pendingRequestRef = useRef<{
    chatId: string;
    content: string;
    clientRequestId: string;
    documentIdsKey: string;
  } | null>(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const linkedContextId = activeChat?.context_id;
  useEffect(() => {
    if (!linkedContextId) return;
    const controller = new AbortController();
    void getContext(linkedContextId, controller.signal).then(setLinkedContext).catch(() => setLinkedContext(null));
    return () => controller.abort();
  }, [linkedContextId]);
  const busy = sending || turn?.status === "pending" || turn?.status === "running";
  const activeTurnId = turn?.id;
  const activeTurnStatus = turn?.status;
  const isChatActive = messages.length > 0 || (loading && Boolean(requestedChatId));
  const { actionsByMessageId, unassignedActions } = groupActionsByMessage(messages, actions);

  const refreshDocuments = useCallback(async (signal?: AbortSignal) => {
    setDocumentsLoading(true);
    setDocumentsError("");
    try {
      setDocuments(await getDocuments("", signal));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setDocumentsError(reason instanceof Error ? reason.message : "Не удалось загрузить документы.");
    } finally {
      if (!signal?.aborted) setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshDocuments(controller.signal);
    return () => controller.abort();
  }, [refreshDocuments]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowLatest(false);
  }, []);

  useEffect(() => {
    const keepLatestVisible = () => {
      if (!isNearBottomRef.current) return;
      window.requestAnimationFrame(() => scrollToLatest("auto"));
    };
    window.addEventListener("resize", keepLatestVisible);
    window.visualViewport?.addEventListener("resize", keepLatestVisible);
    return () => {
      window.removeEventListener("resize", keepLatestVisible);
      window.visualViewport?.removeEventListener("resize", keepLatestVisible);
    };
  }, [scrollToLatest]);

  useLayoutEffect(() => {
    if (isNearBottomRef.current) scrollToLatest("auto");
    else setShowLatest(true);
  }, [actions, messages, scrollToLatest, sending, turn?.status]);

  function handleError(reason: unknown, fallback: string) {
    if (reason instanceof ChatsApiError && reason.status === 401) {
      window.location.replace("/login?next=%2Fworkspace");
      return;
    }
    setError(reason instanceof Error ? reason.message : fallback);
  }

  const loadActions = useCallback(async (chatId: string, signal?: AbortSignal) => {
    const items = await getChatActions(chatId, signal);
    setActions(mergeLogicalActions(items));
    if (items.some((item) => item.kind.includes("transaction"))) {
      try {
        const categories = await getCategories(undefined, signal);
        setCategoryNames(Object.fromEntries(categories.map((category) => [category.id, category.name])));
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setTurn(null);
    setActions([]);
    setBulkResolvingMessageId("");
    setBulkDecision("");
    setBulkErrors({});
    setNextBeforeSequence(null);
    if (requestedChatId) {
      setActiveChatId(requestedChatId);
      setMessages([]);
    }
    void getChats(controller.signal)
      .then(async (items) => {
        const hidden = readStoredStringList(window.localStorage, HIDDEN_CHATS_KEY);
        setCollapsedActionIds(readStoredStringList(window.localStorage, COLLAPSED_ACTIONS_KEY));
        const visible = items.filter((item) => !hidden.includes(item.id));
        setChats(visible);
        if (!requestedChatId) {
          setActiveChatId("");
          setMessages([]);
          return;
        }
        let selected = visible.find((chat) => chat.id === requestedChatId);
        if (!selected) {
          selected = await getChat(requestedChatId, controller.signal);
          setChats((current) => [selected!, ...current.filter((chat) => chat.id !== selected!.id)]);
        }
        setActiveChatId(selected.id);
        const page = await getChatMessages(selected.id, controller.signal);
          setMessages(mergeMessages(page.items));
          setNextBeforeSequence(page.next_before_sequence);
          await loadActions(selected.id, controller.signal);
          const last = page.items.at(-1);
          if (last?.role === "user" && last.turn_id) {
            setTurn(await getChatTurn(selected.id, last.turn_id, controller.signal));
          }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) handleError(reason, "Не удалось загрузить историю диалогов.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadActions, requestedChatId]);

  useEffect(() => {
    if (!activeChatId) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    const refresh = async (event: import("@/lib/chats").ChatSocketEvent) => {
      if (disposed || !event.event.startsWith("turn_") && !event.event.startsWith("action_") && !event.event.startsWith("proposal.") && !event.event.startsWith("action.")) return;
      try {
        if (event.data?.turn_id) setTurn(await getChatTurn(activeChatId, event.data.turn_id));
        if (event.event === "turn_completed") {
          const page = await getChatMessages(activeChatId);
          if (!disposed) {
            setMessages(mergeMessages(page.items));
            setNextBeforeSequence(page.next_before_sequence);
          }
        }
        if (event.event === "turn_completed" || event.event.startsWith("action_") || event.event.startsWith("proposal.") || event.event.startsWith("action.")) await loadActions(activeChatId);
        if (event.event === "turn_failed" && !disposed) {
          setError(event.data?.error_code ? `Генерация завершилась с ошибкой: ${event.data.error_code}.` : "Генерация завершилась с ошибкой.");
        }
      } catch {
        // Existing polling remains the fallback when an event refresh fails.
      }
    };
    void connectChatSocket(activeChatId, (event) => void refresh(event))
      .then((connected) => {
        if (disposed) connected.close();
        else socket = connected;
      })
      .catch(() => { /* Existing polling remains the fallback when WebSocket is unavailable. */ });
    return () => {
      disposed = true;
      socket?.close();
    };
  }, [activeChatId, loadActions]);

  useEffect(() => {
    if (!activeTurnId || !activeChatId || !activeTurnStatus || !["pending", "running"].includes(activeTurnStatus)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const nextTurn = await getChatTurn(activeChatId, activeTurnId, controller.signal);
        if (controller.signal.aborted) return;
        if (nextTurn.status === "completed") {
          const page = await getChatMessages(activeChatId, controller.signal);
          if (!controller.signal.aborted) {
            setMessages(mergeMessages(page.items));
            setNextBeforeSequence(page.next_before_sequence);
            setTurn(nextTurn);
            void loadActions(activeChatId).catch(() => {
              // The answer should remain visible even if action metadata is temporarily unavailable.
            });
          }
          return;
        }
        setTurn(nextTurn);
        if (nextTurn.status === "failed") {
          setError(nextTurn.error_code ? `Генерация завершилась с ошибкой: ${nextTurn.error_code}.` : "Генерация завершилась с ошибкой.");
          return;
        }
        if (nextTurn.status !== "cancelled") timer = setTimeout(() => { void poll(); }, 1_500);
      } catch (reason) {
        if (!controller.signal.aborted) handleError(reason, "Не удалось обновить статус запроса.");
      }
    };

    timer = setTimeout(() => { void poll(); }, 900);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [activeChatId, activeTurnId, activeTurnStatus, loadActions]);

  async function send() {
    if (fileAttachments.some((attachment) => attachment.status !== "ready")) return;
    const content = buildMessageContent(value, textAttachments);
    if (!content || busy) return;
    isNearBottomRef.current = true;
    setShowLatest(false);
    setSending(true);
    setError("");
    try {
      let chat = activeChat;
      if (!chat) {
        chat = await createChat();
        setChats((current) => [chat!, ...current]);
        setActiveChatId(chat.id);
        onChatCreated(chat);
      }
      const documentIds = fileAttachments
        .filter((attachment): attachment is FileAttachment & { documentId: string } => attachment.status === "ready" && Boolean(attachment.documentId))
        .map((attachment) => attachment.documentId);
      const documentIdsKey = documentIds.join(",");
      const previous = pendingRequestRef.current;
      const submission = previous?.chatId === chat.id && previous.content === content && previous.documentIdsKey === documentIdsKey
        ? previous
        : { chatId: chat.id, content, clientRequestId: crypto.randomUUID(), documentIdsKey };
      pendingRequestRef.current = submission;
      const accepted = await sendChatMessage(chat.id, content, submission.clientRequestId, documentIds);
      pendingRequestRef.current = null;
      setMessages((current) => mergeMessages(current, [accepted.message]));
      setTurn(accepted.turn);
      try {
        const updatedChat = await getChat(chat.id);
        setChats((current) => current.map((item) => item.id === updatedChat.id ? updatedChat : item));
        historyStore.upsert(updatedChat);
      } catch {
        // The message was accepted; a title refresh failure must not turn it into a failed send.
      }
      setValue("");
      setTextAttachments([]);
      setFileAttachments([]);
    } catch (reason) {
      if (!(reason instanceof ChatsApiError) || reason.status !== 503) {
        pendingRequestRef.current = null;
      }
      handleError(reason, "Не удалось отправить сообщение.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function loadOlderMessages() {
    if (!activeChat || !nextBeforeSequence) return;
    try {
      const page = await getChatMessages(activeChat.id, undefined, nextBeforeSequence);
      setMessages((current) => mergeMessages(page.items, current));
      setNextBeforeSequence(page.next_before_sequence);
    } catch (reason) {
      handleError(reason, "Не удалось загрузить предыдущие сообщения.");
    }
  }

  async function refreshTurn() {
    if (!activeChat || !turn) return;
    try {
      const nextTurn = await getChatTurn(activeChat.id, turn.id);
      setTurn(nextTurn);
      const page = await getChatMessages(activeChat.id);
      setMessages(mergeMessages(page.items));
      if (nextTurn.status === "completed") await loadActions(activeChat.id);
    } catch (reason) {
      handleError(reason, "Не удалось обновить статус запроса.");
    }
  }

  async function cancelTurn() {
    if (!activeChat || !turn) return;
    try {
      setTurn(await cancelChatTurn(activeChat.id, turn.id));
    } catch (reason) {
      handleError(reason, "Не удалось отменить запрос.");
    }
  }

  async function resolveAction(action: ChatAction, decision: "confirm" | "reject") {
    if (!activeChat || action.status !== "pending" || resolvingActionId || bulkResolvingMessageId) return;
    setResolvingActionId(action.id);
    setActionErrors((current) => ({ ...current, [action.id]: "" }));
    try {
      const updated = decision === "confirm"
        ? await confirmChatAction(activeChat.id, action.id)
        : await rejectChatAction(activeChat.id, action.id);
      setActions((current) => mergeLogicalActions(current.map((item) => item.id === updated.id ? updated : item)));
    } catch (reason) {
      if (reason instanceof ChatsApiError && reason.status === 401) {
        window.location.replace("/login?next=%2Fworkspace");
        return;
      }
      setActionErrors((current) => ({
        ...current,
        [action.id]: reason instanceof Error ? reason.message : "Не удалось обработать действие.",
      }));
      if (reason instanceof ChatsApiError && reason.status === 409) {
        try { await loadActions(activeChat.id); } catch { /* Keep the actionable error visible. */ }
      }
    } finally {
      setResolvingActionId("");
    }
  }

  async function resolveActions(messageId: string, pendingActions: ChatAction[], decision: "confirm" | "reject") {
    if (!activeChat || pendingActions.length < 2 || resolvingActionId || bulkResolvingMessageId) return;
    const currentIds = new Set(actions.filter((action) => action.status === "pending").map((action) => action.id));
    const actionsToResolve = pendingActions.filter((action) => currentIds.has(action.id));
    if (actionsToResolve.length < 2) return;

    setBulkResolvingMessageId(messageId);
    setBulkDecision(decision);
    setBulkErrors((current) => ({ ...current, [messageId]: "" }));
    setActionErrors((current) => {
      const next = { ...current };
      actionsToResolve.forEach((action) => { next[action.id] = ""; });
      return next;
    });
    try {
      const resolve = decision === "confirm" ? confirmChatAction : rejectChatAction;
      const updated = await Promise.all(actionsToResolve.map((action) => resolve(activeChat.id, action.id)));
      const updatedById = new Map(updated.map((action) => [action.id, action]));
      setActions((current) => mergeLogicalActions(current.map((action) => updatedById.get(action.id) ?? action)));
    } catch (reason) {
      if (reason instanceof ChatsApiError && reason.status === 401) {
        window.location.replace("/login?next=%2Fworkspace");
        return;
      }
      setBulkErrors((current) => ({
        ...current,
        [messageId]: reason instanceof Error ? reason.message : "Не удалось обработать все действия.",
      }));
      try { await loadActions(activeChat.id); } catch { /* Keep the actionable error visible. */ }
    } finally {
      setBulkResolvingMessageId("");
      setBulkDecision("");
    }
  }

  async function attachFile(file: File) {
    if (fileAttachments.length >= 10) {
      setError("К одному сообщению можно прикрепить не более 10 документов.");
      return;
    }
    const id = crypto.randomUUID();
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    const base: FileAttachment = { id, name: file.name, size: file.size, status: "selected" };
    if (!supportedDocumentExtensions.has(extension)) {
      setFileAttachments((current) => [...current, { ...base, status: "error", error: "Формат файла не поддерживается." }]);
      return;
    }
    if (file.size > DOCUMENT_MAX_FILE_SIZE) {
      setFileAttachments((current) => [...current, { ...base, status: "error", error: "Файл превышает максимальный размер 50 МБ." }]);
      return;
    }
    setFileAttachments((current) => [...current, { ...base, status: "uploading" }]);
    try {
      const uploaded = await uploadDocument(file, "personal");
      setDocuments((current) => [uploaded, ...current.filter((document) => document.id !== uploaded.id)]);
      setFileAttachments((current) => current.map((item) => item.id === id
        ? { ...item, status: uploaded.status === "ready" ? "ready" : "uploading", documentId: uploaded.id, name: uploaded.filename, size: uploaded.file_size }
        : item));
      if (uploaded.status !== "ready") void waitForDocument(uploaded.id, id);
    } catch (reason) {
      setFileAttachments((current) => current.map((item) => item.id === id
        ? { ...item, status: "error", error: reason instanceof Error ? reason.message : "Не удалось загрузить файл." }
        : item));
    }
  }

  async function waitForDocument(documentId: string, attachmentId: string) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      try {
        const document = await getDocument(documentId);
        setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
        if (document.status === "ready") {
          setFileAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, status: "ready" } : item));
          return;
        }
        if (document.status === "error") {
          setFileAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, status: "error", error: document.error_message || "Ошибка обработки документа." } : item));
          return;
        }
      } catch (reason) {
        setFileAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, status: "error", error: reason instanceof Error ? reason.message : "Не удалось проверить документ." } : item));
        return;
      }
    }
    setFileAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, status: "error", error: "Обработка документа заняла слишком много времени." } : item));
  }

  function toggleActionCollapsed(actionId: string) {
    setCollapsedActionIds((current) => {
      const next = current.includes(actionId) ? current.filter((id) => id !== actionId) : [...current, actionId];
      window.localStorage.setItem(COLLAPSED_ACTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function renderActionGroup(messageId: string, messageActions: ChatAction[]) {
    if (messageActions.length === 0) return null;
    const pendingActions = messageActions.filter((action) => action.status === "pending");
    const bulkBusy = bulkResolvingMessageId === messageId;
    return (
      <section className={s.workspace__actionList} aria-label="Действия агента">
        {pendingActions.length >= 2 && (
          <BulkActionCard
            messageId={messageId}
            actions={pendingActions}
            categoryNames={categoryNames}
            busy={bulkBusy}
            decision={bulkBusy ? bulkDecision : ""}
            disabled={Boolean(resolvingActionId) || Boolean(bulkResolvingMessageId)}
            error={bulkErrors[messageId]}
            onConfirm={() => void resolveActions(messageId, pendingActions, "confirm")}
            onReject={() => void resolveActions(messageId, pendingActions, "reject")}
          />
        )}
        {messageActions.map((action) => {
          const transaction = getTransactionPayload(action);
          return (
            <ChatActionCard
              key={action.id}
              action={action}
              categoryName={transaction ? categoryNames[transaction.category_id] : undefined}
              busy={resolvingActionId === action.id}
              disabled={Boolean(resolvingActionId) || Boolean(bulkResolvingMessageId)}
              error={actionErrors[action.id]}
              collapsed={collapsedActionIds.includes(action.id)}
              onToggleCollapsed={() => toggleActionCollapsed(action.id)}
              onConfirm={() => void resolveAction(action, "confirm")}
              onReject={() => void resolveAction(action, "reject")}
            />
          );
        })}
      </section>
    );
  }

  return (
    <main className={`${s.workspace__main} ${isChatActive ? s["workspace__main--activeChat"] : s["workspace__main--welcome"]}`}>
      <header className={s.workspace__chatHeader}>
        <button className={s.workspace__mobileMenu} aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
        <div className={s.workspace__referenceHeader}>
          <button className={s.workspace__backButton} type="button" aria-label="Назад" onClick={onBack}><ChevronLeft /></button>
          <div className={s.workspace__chatIdentity}>
            <div>
              <div className={s.workspace__chatTitleLine}>
                <MessageSquare />
                <h1>{activeChat?.title ?? "Новый чат"}</h1>
              </div>
              <p>Название обновится по смыслу диалога</p>
              {linkedContextId && <button className={s.workspace__memoryContextChip} type="button" onClick={() => onOpenMemoryContext(linkedContextId)}><Layers3 />Контекст{linkedContext?.id === linkedContextId && <> · {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(linkedContext.date_from))} — {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(new Date(linkedContext.date_to).getTime() - 1))} · {linkedContext.items.length} ист.</>}</button>}
            </div>
          </div>
        </div>
        <div className={s.workspace__headerActions}>
          {!contextOpen && <button className={s.workspace__secondary} aria-label="Открыть контекст" onClick={onContext}><PanelRightOpen /></button>}
          <NotificationsButton />
        </div>
      </header>

      <div
        className={s.workspace__messageHistory}
        ref={messageListRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
          isNearBottomRef.current = nearBottom;
          if (nearBottom) setShowLatest(false);
        }}
      >
        {nextBeforeSequence && (
          <button className={s.workspace__loadOlder} onClick={() => void loadOlderMessages()}>
            Загрузить предыдущие сообщения
          </button>
        )}
        {loading ? (
          <p className={s.workspace__chatState}>Загружаем историю…</p>
        ) : messages.length === 0 ? (
          <div className={s.workspace__chatWelcome}>
            <Image className={s.workspace__mascot} src="/assistant-mascot.png" alt="" aria-hidden="true" width={1448} height={1086} sizes="(max-width: 640px) 112px, 160px" priority />
            <h2>Чем помочь?</h2>
            <p>Я не просто отвечаю на вопросы — предугадываю,<br />что вам нужно, и помогаю двигать идеи вперёд.</p>
          </div>
        ) : messages.map((message) => (
          <Fragment key={message.id}>
            <div className={s.workspace__extraMessage}>
              {message.role === "user" ? (
                <UserMessage message={message} copied={copiedMessageId === message.id} onCopy={() => void copyMessage(message)} />
              ) : (
                <AssistantMessage
                  message={message}
                  animate={message.id === messages.at(-1)?.id && turn?.status === "completed"}
                  timeZone={timeZone}
                />
              )}
            </div>
            {renderActionGroup(message.id, actionsByMessageId.get(message.id) ?? [])}
          </Fragment>
        ))}
        {(sending || (turn && turn.status !== "completed")) && (
          <div className={s.workspace__turnStatus} role="status" aria-live="polite">
            {(sending || turn?.status === "pending" || turn?.status === "running") && (
              <span className={s.workspace__thinkingDots} aria-hidden="true"><i /><i /><i /></span>
            )}
            <span>{sending || turn?.status === "pending" ? "Анализирую запрос…" : turn?.status === "running" ? "Формирую ответ…" : turn?.status === "cancelled" ? "Запрос отменён" : "Не удалось сформировать ответ"}</span>
            {turn && (turn.status === "pending" || turn.status === "running") && <button onClick={() => void refreshTurn()}><RefreshCw />Обновить</button>}
            {turn?.status === "pending" && <button onClick={() => void cancelTurn()}>Отменить</button>}
            {turn?.status === "failed" && turn.error_code && <span>Код: {turn.error_code}</span>}
          </div>
        )}
        {renderActionGroup("unassigned-actions", unassignedActions)}
        {error && <p className={s.workspace__chatError} role="alert">{error}</p>}
      </div>

      {showLatest && <button className={s.workspace__newMessages} type="button" onClick={() => scrollToLatest()}>↓ Новые сообщения</button>}

      <div className={s.workspace__inputArea}>
        <ChatComposer
          value={value}
          onChange={setValue}
          onSend={() => { void send().catch(reason => handleError(reason, "Не удалось отправить сообщение.")); }}
          sources={sources}
          onRemoveSource={onRemoveSource}
          fileAttachments={fileAttachments}
          documents={documents}
          documentsLoading={documentsLoading}
          documentsError={documentsError}
          onRefreshDocuments={() => void refreshDocuments()}
          onSelectDocument={(document) => {
            if (fileAttachments.length >= 10 || fileAttachments.some((attachment) => attachment.documentId === document.id)) return;
            setFileAttachments((current) => [...current, { id: crypto.randomUUID(), documentId: document.id, name: document.filename, size: document.file_size, status: "ready" }]);
          }}
          fileAccept={DOCUMENT_FILE_ACCEPT}
          onSelectFile={(file) => void attachFile(file)}
          onRemoveFileAttachment={(id) => setFileAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          textAttachments={textAttachments}
          onAddTextAttachment={(attachment) => setTextAttachments((current) => [...current, attachment])}
          onRemoveTextAttachment={(id) => setTextAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          inputRef={inputRef}
          disabled={busy}
          sendDisabled={fileAttachments.some((attachment) => attachment.status !== "ready")}
        />
        <ContextQuickActions
          onOpen={onOpenSourcePicker}
          onSelect={(text) => {
            setValue(text);
            inputRef.current?.focus();
          }}
        />
      </div>
    </main>
  );

  async function copyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? "" : current), 1_600);
  }
}

function UserMessage({ message, copied, onCopy }: { message: ChatMessage; copied: boolean; onCopy: () => void }) {
  const parsed = parseUserContent(message.content);
  const persistedAttachments = message.attachments ?? [];
  return (
    <div className={s.workspace__userMessage}>
      <div className={s.workspace__userBubble}>
        {parsed.text && <p>{parsed.text}</p>}
        {parsed.attachments.map((attachment) => <span className={s.workspace__sentAttachment} key={attachment.name}><FileText />{attachment.name}</span>)}
        {[...persistedAttachments.map((attachment) => ({ id: attachment.document_id, name: attachment.filename })), ...parsed.files.filter((file) => !persistedAttachments.some((attachment) => attachment.document_id === file.id))].map((file) => <span className={s.workspace__sentAttachment} key={file.id}><Paperclip />{file.name}</span>)}
      </div>
      <div className={s.workspace__userMeta}><button type="button" onClick={onCopy}><Copy />{copied ? "Скопировано" : "Копировать"}</button><small>Вы · {new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></div>
    </div>
  );
}

function AssistantMessage({
  message,
  animate,
  timeZone,
}: {
  message: ChatMessage;
  animate: boolean;
  timeZone: string;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const hasCitations = Boolean(message.is_supported !== false && message.citations?.length);
  const isUnsupported = message.is_supported === false || (!hasCitations && message.is_supported !== true);
  return (
    <div className={s.workspace__agentMessage}>
      <GigaMark />
      <div className={s.workspace__agentContent}>
        <div className={s.workspace__agentIdentity}>
          <strong>Workspace AI</strong>
          <span>AI-помощник</span>
          <time dateTime={message.created_at}>{time}</time>
        </div>
        <ProgressiveMessage text={message.content} animate={animate} />
        {hasCitations && <ChatCitations citations={message.citations!} timeZone={timeZone} />}
        {isUnsupported && (
          <div
            className={s.workspace__unsupportedBadge}
            title="Ответ сгенерирован без подтверждения в памяти или инструментах"
          >
            <Info aria-hidden="true" /> Без подтверждения в памяти
          </div>
        )}
      </div>
    </div>
  );
}

const actionStatusLabels: Record<ChatAction["status"], string> = {
  pending: "Требуется подтверждение",
  executed: "Выполнено",
  rejected: "Отклонено",
  expired: "Срок истёк",
};

function formatActionDate(value: string, withTime = false) {
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return new Intl.DateTimeFormat("ru-RU", withTime
    ? { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function getCalendarPayload(action: ChatAction) {
  if (action.kind === "create_calendar_event") return action.payload;
  if (action.kind === "update_calendar_event") return action.payload.replacement;
  if (action.kind === "delete_calendar_event") return action.payload.snapshot;
  return null;
}

function getTransactionPayload(action: ChatAction) {
  if (action.kind === "create_transaction") return action.payload;
  if (action.kind === "update_transaction") return action.payload.replacement;
  if (action.kind === "delete_transaction") return action.payload.snapshot;
  return null;
}

function getTopicPayload(action: ChatAction) {
  if (action.kind === "create_tracked_topic") return action.payload;
  if (action.kind === "delete_tracked_topic") return action.payload.snapshot;
  return null;
}

function getFinanceCategoryPayload(action: ChatAction) {
  if (action.kind === "create_finance_category") return action.payload;
  if (action.kind === "update_finance_category") return action.payload.changes;
  if (action.kind === "delete_finance_category") return action.payload.snapshot;
  return null;
}

function getActionPresentation(action: ChatAction, categoryName?: string): {
  Icon: LucideIcon;
  title: string;
  summary: string;
  detail: string;
  amount: string;
} {
  const calendar = getCalendarPayload(action);
  const transaction = getTransactionPayload(action);
  const topic = getTopicPayload(action);
  const financeCategory = getFinanceCategoryPayload(action);
  const email = action.kind === "send_email" ? action.payload : null;
  const amount = transaction
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: transaction.currency, maximumFractionDigits: 2 }).format(Number(transaction.amount))
    : "";
  const titles: Record<ChatAction["kind"], string> = {
    create_calendar_event: "Создать событие",
    update_calendar_event: "Изменить событие",
    delete_calendar_event: "Удалить событие",
    create_transaction: transaction?.type === "income" ? "Добавить доход" : "Добавить расход",
    update_transaction: "Изменить операцию",
    delete_transaction: "Удалить операцию",
    create_finance_category: "Создать категорию",
    update_finance_category: "Изменить категорию",
    delete_finance_category: "Удалить категорию",
    create_tracked_topic: "Отслеживать тему",
    delete_tracked_topic: "Прекратить отслеживание",
    send_email: "Отправить письмо",
  };
  const summary = calendar?.title || amount || financeCategory?.name || topic?.query || email?.subject || "";
  const detail = calendar
    ? [calendar.title, formatActionDate(calendar.starts_at, true)].filter(Boolean).join(" • ")
    : transaction
      ? [amount, categoryName ?? transaction.description].filter(Boolean).join(" • ")
      : financeCategory
        ? [financeCategory.name, financeCategory.type === "income" ? "Доход" : financeCategory.type === "expense" ? "Расход" : ""].filter(Boolean).join(" • ")
        : topic
          ? [topic.query, topic.scope === "work" ? "Рабочее" : "Личное"].join(" • ")
          : email ? [email.subject, email.to.join(", ")].filter(Boolean).join(" • ") : "";
  return {
    Icon: calendar ? CalendarPlus : transaction || financeCategory ? WalletCards : email ? Mail : Rss,
    title: titles[action.kind],
    summary,
    detail,
    amount,
  };
}

function BulkActionCard({
  messageId,
  actions,
  categoryNames,
  busy,
  decision,
  disabled,
  error,
  onConfirm,
  onReject,
}: {
  messageId: string;
  actions: ChatAction[];
  categoryNames: Record<string, string>;
  busy: boolean;
  decision: "confirm" | "reject" | "";
  disabled: boolean;
  error?: string;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const disclosureId = `bulk-actions-${messageId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const count = actions.length;

  return (
    <article className={s.workspace__bulkActionCard}>
      <header>
        <span className={s.workspace__bulkActionIcon}><Layers3 aria-hidden="true" /></span>
        <div className={s.workspace__bulkActionHeading}>
          <p>Действия агента</p>
          <h3>Подтвердить все действия</h3>
          <button
            className={s.workspace__bulkActionDisclosure}
            type="button"
            aria-expanded={open}
            aria-controls={disclosureId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            Показать {count} действия
          </button>
        </div>
        <span className={s.workspace__bulkActionStatus}>Требуется подтверждение</span>
      </header>

      {open && (
        <div className={s.workspace__bulkActionPopover} id={disclosureId}>
          <p>Включённые действия ({count})</p>
          <div className={s.workspace__bulkActionRows}>
            {actions.map((action) => {
              const transaction = getTransactionPayload(action);
              const presentation = getActionPresentation(action, transaction ? categoryNames[transaction.category_id] : undefined);
              const Icon = presentation.Icon;
              return (
                <div className={s.workspace__bulkActionRow} key={action.id}>
                  <span><Icon aria-hidden="true" /></span>
                  <div>
                    <strong>{presentation.title}</strong>
                    {presentation.detail && <p>{presentation.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <footer>
        <p><Info aria-hidden="true" />Действия выполнятся только после вашего подтверждения.</p>
        <div>
          <button className={s.workspace__actionReject} type="button" disabled={disabled} onClick={onReject}>
            {busy && decision === "reject" ? <LoaderCircle className={s.workspace__actionSpinner} aria-hidden="true" /> : <XCircle aria-hidden="true" />}
            Отклонить все
          </button>
          <button className={s.workspace__actionConfirm} type="button" disabled={disabled} onClick={onConfirm}>
            {busy && decision === "confirm" ? <LoaderCircle className={s.workspace__actionSpinner} aria-hidden="true" /> : <Check aria-hidden="true" />}
            Подтвердить все ({count})
          </button>
        </div>
      </footer>
      {error && <p className={s.workspace__actionError} role="alert">{error}</p>}
    </article>
  );
}

function ChatActionCard({
  action,
  categoryName,
  busy,
  disabled,
  error,
  collapsed,
  onToggleCollapsed,
  onConfirm,
  onReject,
}: {
  action: ChatAction;
  categoryName?: string;
  busy: boolean;
  disabled: boolean;
  error?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const calendar = getCalendarPayload(action);
  const transaction = getTransactionPayload(action);
  const topic = getTopicPayload(action);
  const financeCategory = getFinanceCategoryPayload(action);
  const presentation = getActionPresentation(action, categoryName);
  const email = action.kind === "send_email" ? action.payload : null;
  const { Icon, title, summary, amount } = presentation;
  const collapsible = action.status !== "pending";
  const statusLabel = busy && action.status === "pending" ? "Выполняется" : action.status === "pending" && action.execution_status === "failed" ? "Ошибка выполнения" : action.status === "pending" && action.execution_status === "executing" ? "Выполняется" : action.status === "pending" && action.execution_status === "confirmed" ? "Подтверждено в Telegram" : actionStatusLabels[action.status];
  const actionHint = action.kind.startsWith("delete_")
    ? "Удаление произойдёт только после вашего подтверждения."
    : action.kind.startsWith("update_")
      ? "Изменения сохранятся только после вашего подтверждения."
      : "Действие выполнится только после вашего подтверждения.";

  if (collapsible && collapsed) {
    return (
      <button className={`${s.workspace__actionCard} ${s.workspace__actionCardCollapsed}`} type="button" onClick={onToggleCollapsed} aria-label={`Развернуть действие «${title}»`}>
        {action.status === "executed" ? <CheckCircle2 /> : <XCircle />}
        <strong>{title}</strong>
        <span>{summary}</span>
        <span className={s.workspace__actionStatus}>{statusLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>
    );
  }

  return (
    <article className={`${s.workspace__actionCard} ${s[`workspace__actionCard--${action.status}`]}`}>
      <header>
        <span className={s.workspace__actionIcon}><Icon aria-hidden="true" /></span>
        <div>
          <p>{action.source_channel === "telegram" ? "Telegram" : "Действие агента"}</p>
          <h3>{title}</h3>
        </div>
        <span className={s.workspace__actionStatus}>{statusLabel}</span>
      </header>
      <dl>
        {action.source_channel === "telegram" && <>
          {action.source_sender && <div><dt>Участник</dt><dd>{action.source_sender}</dd></div>}
          {action.source_chat_title && <div><dt>Чат</dt><dd>{action.source_chat_title}</dd></div>}
        </>}
        {calendar ? <>
          <div><dt>Название</dt><dd>{calendar.title}</dd></div>
          <div><dt>Начало</dt><dd>{formatActionDate(calendar.starts_at, true)}</dd></div>
          {calendar.ends_at && <div><dt>Окончание</dt><dd>{formatActionDate(calendar.ends_at, true)}</dd></div>}
          <div><dt>Область</dt><dd>{calendar.scope === "work" ? "Рабочее" : "Личное"}</dd></div>
          {calendar.location && <div><dt>Место</dt><dd>{calendar.location}</dd></div>}
          {calendar.description && <div className={s.workspace__actionWide}><dt>Описание</dt><dd>{calendar.description}</dd></div>}
        </> : transaction ? <>
          <div><dt>Сумма</dt><dd>{amount}</dd></div>
          <div><dt>Дата</dt><dd>{formatActionDate(transaction.date)}</dd></div>
          <div><dt>Категория</dt><dd>{categoryName ?? "Категория операции"}</dd></div>
          <div><dt>Область</dt><dd>{transaction.scope === "work" ? "Работа" : "Личное"}</dd></div>
          {transaction.description && <div className={s.workspace__actionWide}><dt>Описание</dt><dd>{transaction.description}</dd></div>}
        </> : financeCategory ? <>
          {financeCategory.name && <div><dt>Название</dt><dd>{financeCategory.name}</dd></div>}
          {financeCategory.type && <div><dt>Тип</dt><dd>{financeCategory.type === "income" ? "Доход" : "Расход"}</dd></div>}
        </> : topic ? <>
          <div className={s.workspace__actionWide}><dt>Тема</dt><dd>{topic.query}</dd></div>
          <div><dt>Область</dt><dd>{topic.scope === "work" ? "Рабочее" : "Личное"}</dd></div>
        </> : email ? <>
          <div className={s.workspace__actionWide}><dt>Кому</dt><dd>{email.to.join(", ")}</dd></div>
          <div className={s.workspace__actionWide}><dt>Тема письма</dt><dd>{email.subject}</dd></div>
          <div className={s.workspace__actionWide}><dt>Текст письма</dt><dd>{email.body}</dd></div>
        </> : null}
      </dl>
      {action.source_channel === "telegram" && <>
        <button className={s.workspace__actionReject} type="button" aria-expanded={showWhy} onClick={() => setShowWhy((current) => !current)}>Почему?</button>
        {showWhy && <p className={s.workspace__actionWide}>
          Основано на сообщении{action.source_timestamp ? ` от ${formatActionDate(action.source_timestamp, true)}` : ""}: {action.source_excerpt || "Контекст сохранён в диалоге агента."}
        </p>}
      </>}
      {action.status === "pending" && (action.execution_status === "confirmed" || action.execution_status === "executing") ? (
        <footer><p>Действие подтверждено в Telegram и обрабатывается.</p></footer>
      ) : action.status === "pending" ? (
        <footer>
          <p>{actionHint}</p>
          <div>
            <button className={s.workspace__actionReject} type="button" disabled={disabled} onClick={onReject}><XCircle />Отклонить</button>
            <button className={s.workspace__actionConfirm} type="button" disabled={disabled} onClick={onConfirm}><Check />{busy ? "Выполняю…" : action.kind.startsWith("delete_") ? "Удалить" : action.kind.startsWith("update_") ? "Сохранить изменения" : topic ? "Начать отслеживать" : calendar ? "Создать событие" : financeCategory ? "Создать категорию" : email ? "Отправить письмо" : "Добавить операцию"}</button>
          </div>
        </footer>
      ) : (
        <footer className={s.workspace__actionResolved}>
          {action.status === "executed" ? <CheckCircle2 /> : <XCircle />}
          <span>{action.status === "executed" ? "Действие выполнено и сохранено." : action.status === "rejected" ? "Вы отклонили это действие." : "Это предложение больше нельзя подтвердить."}</span>
          {collapsible && <button className={s.workspace__actionCollapse} type="button" onClick={onToggleCollapsed} aria-label={`Свернуть действие «${title}»`}><ChevronUp />Свернуть</button>}
        </footer>
      )}
      {error && <p className={s.workspace__actionError} role="alert">{error}</p>}
    </article>
  );
}

function ProgressiveMessage({ text, animate }: { text: string; animate: boolean }) {
  const [visible, setVisible] = useState(animate ? "" : text);
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const immediate = window.setTimeout(() => setVisible(text), 0);
      return () => window.clearTimeout(immediate);
    }
    const chunks = Array.from(text);
    let index = 0;
    const timer = window.setInterval(() => {
      index = Math.min(chunks.length, index + Math.max(1, Math.ceil(chunks.length / 180)));
      setVisible(chunks.slice(0, index).join(""));
      if (index >= chunks.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [animate, text]);
  return (
    <div className={s.workspace__markdown}>
      <MarkdownContent text={visible} />
      {visible.length < text.length && <span className={s.workspace__streamCursor} aria-hidden="true" />}
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_))/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    const token = match[0];
    if (token.startsWith("`")) parts.push(<code key={index}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      parts.push(link ? <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a> : token);
    } else if (token.startsWith("**") || token.startsWith("__")) parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else parts.push(<em key={index}>{token.slice(1, -1)}</em>);
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      blocks.push(level === 1 ? <h2 key={index}>{content}</h2> : level === 2 ? <h3 key={index}>{content}</h3> : <h4 key={index}>{content}</h4>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((item, quoteIndex) => <Fragment key={quoteIndex}>{renderInline(item)}{quoteIndex < quote.length - 1 && <br />}</Fragment>)}</blockquote>);
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const items: string[] = [];
      const matcher = unordered ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(matcher);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>);
      blocks.push(unordered ? <ul key={`list-${index}`}>{children}</ul> : <ol key={`list-${index}`}>{children}</ol>);
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+|^```|^>\s?|^\s*[-*+]\s+|^\s*\d+[.)]\s+/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((item, paragraphIndex) => <Fragment key={paragraphIndex}>{renderInline(item)}{paragraphIndex < paragraph.length - 1 && <br />}</Fragment>)}</p>);
  }
  return <>{blocks}</>;
}
