"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, LoaderCircle, LogOut, Mail, Menu, MoreHorizontal, Plus, Reply, Search, Send, SlidersHorizontal, X } from "lucide-react";
import { getMailMessage, getMailMessages, markMailMessageAsRead, sendMail, MailApiError, type MailAccount, type MailMessage, type MailMessageListItem } from "@/lib/mail";
import s from "./MailInbox.module.css";

type Filter = "all" | "unread" | "read";
type Composer = { mode: "new" | "reply"; to: string; subject: string; body: string; accountId: string | null; replyId?: string };
const PAGE_SIZE = 30;

export function MailInbox({ accounts, reauthAccounts, onMenu, onConnect, onDisconnect }: { accounts: MailAccount[]; reauthAccounts: MailAccount[]; onMenu: () => void; onConnect: () => void; onDisconnect: (accountId: string) => Promise<void> }) {
  const [accountId, setAccountId] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MailMessageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessage | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [readError, setReadError] = useState("");
  const [composer, setComposer] = useState<Composer | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [notice, setNotice] = useState("");
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const listRequest = useRef(0);
  const sendAttempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 280); return () => clearTimeout(timer); }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++listRequest.current;
    getMailMessages({ accountId: accountId || undefined, query: query || undefined, isRead: filter === "all" ? undefined : filter === "read", limit: PAGE_SIZE }, controller.signal)
      .then((result) => { if (controller.signal.aborted || requestId !== listRequest.current) return; setItems(result.items); setTotal(result.total); setListError(""); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : "Не удалось загрузить письма."); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [accountId, query, filter]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    getMailMessage(selectedId, controller.signal).then(async (message) => {
      if (controller.signal.aborted) return;
      setDetail(message); setDetailError(""); setDetailLoading(false);
      if (!message.is_read) {
        try {
          const updated = await markMailMessageAsRead(message.id);
          if (controller.signal.aborted) return;
          setDetail(updated);
          setItems((current) => current.map((item) => item.id === message.id ? { ...item, is_read: true } : item));
          setReadError("");
        } catch (cause) { if (!controller.signal.aborted) setReadError(cause instanceof Error ? cause.message : "Не удалось отметить письмо как прочитанное."); }
      }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) { setDetailError(cause instanceof Error ? cause.message : "Не удалось открыть письмо."); setDetailLoading(false); } });
    return () => controller.abort();
  }, [selectedId]);

  function selectMessage(id: string) { setSelectedId(id); setDetail(null); setDetailError(""); setReadError(""); setDetailLoading(true); }
  async function loadMore() {
    setListLoading(true);
    const requestId = ++listRequest.current;
    try {
      const result = await getMailMessages({ accountId: accountId || undefined, query: query || undefined, isRead: filter === "all" ? undefined : filter === "read", limit: PAGE_SIZE, offset: items.length });
      if (requestId !== listRequest.current) return;
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setTotal(result.total); setListError("");
    } catch (cause) { setListError(cause instanceof Error ? cause.message : "Не удалось загрузить письма."); }
    finally { if (requestId === listRequest.current) setListLoading(false); }
  }
  function startCompose(mode: "new" | "reply") {
    if (mode === "reply" && detail) setComposer({ mode, to: detail.from_email, subject: /^re:/i.test(detail.subject) ? detail.subject : `Re: ${detail.subject}`, body: "", accountId: detail.account_id, replyId: detail.id });
    else setComposer({ mode: "new", to: "", subject: "", body: "", accountId: accountId || accounts[0].id });
    setSendError("");
  }
  async function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!composer || sending) return;
    const payload = { to: [composer.to.trim()], subject: composer.subject.trim(), body: composer.body.trim(), account_id: composer.accountId, ...(composer.replyId ? { in_reply_to_id: composer.replyId } : {}) };
    const signature = JSON.stringify(payload);
    if (sendAttempt.current?.signature !== signature) sendAttempt.current = { signature, key: crypto.randomUUID() };
    setSending(true); setSendError("");
    try {
      await sendMail({ ...payload, idempotency_key: sendAttempt.current.key });
      sendAttempt.current = null;
      setComposer(null); setNotice("Письмо отправлено");
    } catch (cause) { setSendError(cause instanceof MailApiError && cause.status === 409 ? "Статус отправки неизвестен. Проверьте отправленные письма перед новой отправкой." : cause instanceof Error ? cause.message : "Не удалось отправить письмо."); }
    finally { setSending(false); }
  }
  async function disconnectAccount(account: MailAccount) {
    if (disconnectingId || !window.confirm(`Выйти из аккаунта ${account.email}? Сохранённые письма этого аккаунта будут удалены.`)) return;
    setDisconnectingId(account.id);
    setAccountOpen(false);
    try {
      await onDisconnect(account.id);
      if (accountId === account.id) setAccountId("");
      setSelectedId(null); setDetail(null); setItems([]); setTotal(0); setListLoading(true);
      setNotice(`Аккаунт ${account.email} отключён`);
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : "Не удалось отключить почтовый аккаунт.");
    } finally { setDisconnectingId(null); }
  }

  const activeAccount = accounts.find((account) => account.id === accountId);
  const accountLabel = activeAccount ?? accounts[0];
  return <main className={s.inbox}>
    <section className={`${s.listPane} ${selectedId ? s.hasSelection : ""}`}>
      <header className={s.header}><button className={s.mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}><Menu /></button><div className={s.heading}><h1>Почта</h1><p>Все письма из подключённых аккаунтов</p></div><button className={s.composeButton} type="button" onClick={() => startCompose("new")}><Plus />Написать</button></header>
      {reauthAccounts.length > 0 && <div className={s.inlineError} role="alert">Почта {reauthAccounts.map((account) => account.email).join(", ")} требует повторного подключения. <button type="button" onClick={onConnect}>Подключить заново</button></div>}
      <div className={s.searchRow}><label className={s.search}><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по письмам" aria-label="Поиск по письмам" /></label><div className={s.filters} aria-label="Фильтр писем">{([ ["all", "Все"], ["unread", "Непрочитанные"], ["read", "Прочитанные"] ] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? s.activeFilter : ""} onClick={() => { setFilter(value); setListLoading(true); }}>{label}</button>)}</div><button className={s.iconButton} type="button" title="Дополнительные фильтры — скоро" disabled><SlidersHorizontal /></button></div>
      <div className={s.accountBar}><div className={s.accountPicker}><button type="button" className={s.accountButton} aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}><ProviderIcon provider={accountLabel.provider} /><span>{activeAccount ? activeAccount.email : accounts.length === 1 ? accountLabel.email : "Все аккаунты"}</span><ChevronDown /></button>{accountOpen && <div className={s.accountMenu}><button type="button" onClick={() => { setAccountId(""); setAccountOpen(false); setListLoading(true); }}>Все аккаунты</button>{accounts.map((account) => <div className={s.accountMenuRow} key={account.id}><button className={s.accountChoice} type="button" onClick={() => { setAccountId(account.id); setAccountOpen(false); setListLoading(true); }}><ProviderIcon provider={account.provider} /><span>{account.email}<small>{account.provider === "gmail" ? "Gmail" : "Outlook"}</small></span></button><button className={s.disconnectAccount} type="button" aria-label={`Выйти из аккаунта ${account.email}`} title="Выйти из аккаунта" disabled={disconnectingId !== null} onClick={() => void disconnectAccount(account)}>{disconnectingId === account.id ? <LoaderCircle className={s.spin} /> : <LogOut />}</button></div>)}<button type="button" className={s.addAccount} onClick={onConnect}><Plus />Подключить ещё почту</button></div>}</div><span>{total} {plural(total, "письмо", "письма", "писем")}</span></div>
      <div className={s.messageList} aria-busy={listLoading}>{listError && <div className={s.inlineError} role="alert">{listError}</div>}{listLoading && !items.length && <div className={s.state}><LoaderCircle className={s.spin} />Загружаем письма...</div>}{!listLoading && !listError && items.length === 0 && <div className={s.state}><Mail />{query || filter !== "all" ? "Письма не найдены" : "Писем пока нет"}</div>}{items.map((item) => <button type="button" key={item.id} className={`${s.messageRow} ${selectedId === item.id ? s.selected : ""} ${!item.is_read ? s.unread : ""}`} onClick={() => selectMessage(item.id)}><span className={s.avatar}>{initials(item.from_name || item.from_email)}</span><span className={s.rowContent}><span className={s.sender}>{!item.is_read && <i className={s.unreadDot} />}{item.from_name || item.from_email}</span><span className={s.subject}>{item.subject || "(Без темы)"}</span><span className={s.preview}>{item.delivery_status === "uncertain" ? "Статус отправки неизвестен · " : item.delivery_status === "sending" ? "Отправка выполняется · " : ""}{item.preview}</span></span><span className={s.rowMeta}><time dateTime={item.received_at}>{formatListDate(item.received_at)}</time><ProviderIcon provider={accounts.find((account) => account.id === item.account_id)?.provider} /><MoreHorizontal aria-hidden="true" /></span></button>)}{!listLoading && items.length < total && <button className={s.moreButton} type="button" onClick={() => void loadMore()}>Показать ещё</button>}</div>
    </section>
    <section className={`${s.readPane} ${selectedId ? s.readPaneOpen : ""}`} aria-label="Просмотр письма"><div className={s.toolbar}><button type="button" className={s.iconButton} title="Назад к списку" onClick={() => setSelectedId(null)}><ArrowLeft /></button><div className={s.toolbarRight}>{["Архивировать", "Удалить", "Пометить", "Ещё"].map((title) => <button key={title} type="button" className={s.iconButton} title={`${title} — скоро`} disabled><MoreHorizontal /></button>)}</div></div>{detailLoading && <div className={s.state}><LoaderCircle className={s.spin} />Открываем письмо...</div>}{detailError && <div className={s.inlineError} role="alert">{detailError}</div>}{detail && !detailLoading && <article className={s.messageDetail}><h2>{detail.subject || "(Без темы)"}</h2>{(detail.delivery_status === "uncertain" || detail.delivery_status === "sending") && <div className={s.inlineError} role="status">{detail.delivery_status === "uncertain" ? "Статус отправки неизвестен. Проверьте почту у получателя перед повторной отправкой." : "Отправка письма выполняется."}</div>}<div className={s.detailSender}><span className={s.avatar}>{initials(detail.from_name || detail.from_email)}</span><div><strong>{detail.from_name || detail.from_email}</strong><span>{detail.from_email}</span></div><time dateTime={detail.received_at}>{formatDetailDate(detail.received_at)}</time></div>{readError && <div className={s.inlineError} role="alert">{readError}</div>}<div className={s.body}>{detail.body_text || detail.preview || "Текст письма отсутствует"}</div><div className={s.detailActions}><button type="button" onClick={() => startCompose("reply")}><Reply />Ответить</button><button type="button" title="Ответить всем — скоро" disabled>Ответить всем</button><button type="button" title="Переслать — скоро" disabled>Переслать</button></div></article>}{!selectedId && <div className={s.emptyDetail}><Mail /><p>Выберите письмо для просмотра</p></div>}</section>
    {composer && <div className={s.composeBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) setComposer(null); }}><form className={s.composePanel} onSubmit={(event) => void submitMessage(event)}><header><h2>{composer.mode === "reply" ? "Ответить" : "Новое письмо"}</h2><button type="button" aria-label="Закрыть" onClick={() => setComposer(null)} disabled={sending}><X /></button></header><label>От<select value={composer.accountId ?? ""} onChange={(event) => setComposer({ ...composer, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}</select></label><label>Кому<input type="email" required value={composer.to} onChange={(event) => setComposer({ ...composer, to: event.target.value })} /></label><label>Тема<input required value={composer.subject} onChange={(event) => setComposer({ ...composer, subject: event.target.value })} /></label><textarea required aria-label="Текст письма" value={composer.body} onChange={(event) => setComposer({ ...composer, body: event.target.value })} placeholder="Напишите сообщение..." />{sendError && <div className={s.inlineError} role="alert">{sendError}</div>}<button className={s.sendButton} type="submit" disabled={sending}>{sending ? <LoaderCircle className={s.spin} /> : <Send />}Отправить</button></form></div>}
    {notice && <div className={s.toast} role="status">{notice}<button type="button" aria-label="Закрыть" onClick={() => setNotice("")}><X /></button></div>}
  </main>;
}

function ProviderIcon({ provider }: { provider?: string }) { return provider === "gmail" || provider === "outlook" ? <Image src={`/mail/${provider}.svg`} alt={provider === "gmail" ? "Gmail" : "Outlook"} width={17} height={17} /> : <Mail aria-hidden="true" />; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }
function formatListDate(value: string) { const date = new Date(value); const today = new Date(); return date.toDateString() === today.toDateString() ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date) : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date); }
function formatDetailDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function plural(count: number, one: string, few: string, many: string) { const n = Math.abs(count) % 100; const digit = n % 10; return n > 10 && n < 20 ? many : digit === 1 ? one : digit >= 2 && digit <= 4 ? few : many; }
