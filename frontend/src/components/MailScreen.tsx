"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Mail, Menu, Plus, X } from "lucide-react";
import { disconnectMailAccount, getMailAccounts, getMailConnectUrl, syncMailAccount, syncMailAccounts, type MailAccount } from "@/lib/mail";
import { MailInbox } from "./MailInbox";
import s from "./MailScreen.module.css";
import { useDialogFocus } from "./useDialogFocus";

type ProviderId = "gmail" | "outlook" | "yandex" | "mailru";
type Provider = { id: ProviderId; name: string; description: string; icon: string; comingSoon?: string };
const providers: Provider[] = [
  { id: "gmail", name: "Gmail", description: "Подключите аккаунт Google", icon: "/mail/gmail.svg" },
  { id: "outlook", name: "Microsoft Outlook", description: "Подключите аккаунт Microsoft", icon: "/mail/outlook.svg" },
  { id: "yandex", name: "Яндекс Почта", description: "Подключите аккаунт Яндекса", icon: "/mail/yandexmail.svg", comingSoon: "Интеграция с Яндекс Почтой находится в разработке" },
  { id: "mailru", name: "Mail.ru", description: "Подключите аккаунт Mail.ru", icon: "/mail/mailru.svg", comingSoon: "Интеграция с Mail.ru находится в разработке" },
];
const connected = (items: MailAccount[]) => items.filter((item) => item.status === "connected" && (item.provider === "gmail" || item.provider === "outlook"));
const needsReconnect = (items: MailAccount[]) => items.filter((item) => item.status === "reauth_required" || item.status === "invalid");
const accountKey = (account: MailAccount) => `${account.id}:${account.external_account_id ?? ""}`;

export function MailScreen({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [reauthAccounts, setReauthAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<ProviderId | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  useDialogFocus(selectorOpen, '[aria-labelledby="mail-provider-title"]', () => setSelectorOpen(false));
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authPending = useRef(false);
  const syncPending = useRef(false);
  const authPopup = useRef<Window | null>(null);
  const priorAccountIds = useRef<Set<string>>(new Set());
  const priorReauthIds = useRef<Set<string>>(new Set());
  const pendingProvider = useRef<ProviderId | null>(null);
  const [retry, setRetry] = useState(0);

  const loadAccounts = useCallback(async (signal?: AbortSignal) => {
    const items = await getMailAccounts(signal);
    const active = connected(items);
    if (!signal?.aborted) {
      setAccounts(active);
      setReauthAccounts(needsReconnect(items));
    }
    return active;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMailAccounts(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      const active = connected(items);
      setAccounts(active);
      setReauthAccounts(needsReconnect(items));
      if (pathname === "/mail") router.replace(active.length ? "/mail/inbox" : "/mail/connect");
      if (pathname === "/mail/inbox" && !active.length) router.replace("/mail/connect");
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось проверить подключённые аккаунты.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [pathname, router, retry]);

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4500);
  }

  const finishConnection = useCallback(async () => {
    if (!authPending.current || syncPending.current) return;
    syncPending.current = true;
    try {
      let connectedAccount: MailAccount | undefined;
      for (let attempt = 0; attempt < 8; attempt++) {
        await syncMailAccounts();
        const active = await loadAccounts();
        connectedAccount = active.find((account) => account.provider === pendingProvider.current &&
          (!priorAccountIds.current.has(accountKey(account)) || priorReauthIds.current.has(account.id)));
        if (connectedAccount) break;
        if (attempt < 7) await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      authPending.current = false;
      if (connectedAccount) {
        await syncMailAccount(connectedAccount.id);
        const active = await loadAccounts();
        if (!active.some((account) => account.id === connectedAccount.id)) throw new Error("Почтовый аккаунт требует повторного подключения.");
        router.replace("/mail/inbox");
      }
      else setError("Новый аккаунт не появился. Если вы отменили авторизацию, попробуйте ещё раз.");
    } catch (cause) {
      await loadAccounts().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Не удалось синхронизировать почтовые аккаунты.");
    } finally { syncPending.current = false; setConnecting(null); }
  }, [loadAccounts, router]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    await disconnectMailAccount(accountId);
    const active = await loadAccounts();
    if (!active.length) router.replace("/mail/connect");
  }, [loadAccounts, router]);

  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible" && (!authPopup.current || authPopup.current.closed)) void finishConnection(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [finishConnection]);

  async function connect(provider: Provider) {
    setSelectorOpen(false);
    setError("");
    setAuthUrl("");
    if (provider.comingSoon) { showNotice(provider.comingSoon); return; }
    priorAccountIds.current = new Set([...accounts, ...reauthAccounts].map(accountKey));
    priorReauthIds.current = new Set(reauthAccounts.map((account) => account.id));
    pendingProvider.current = provider.id;
    setConnecting(provider.id);
    const popup = window.open("about:blank", "restore-mail-connect", "popup=yes,width=620,height=760,left=120,top=80");
    authPopup.current = popup;
    try {
      const result = await getMailConnectUrl(provider.id as "gmail" | "outlook");
      if (!result.connect_link_url) throw new Error("Сервис не вернул ссылку для подключения.");
      authPending.current = true;
      if (popup) {
        popup.location.replace(result.connect_link_url);
        popup.focus();
        await waitForPopupClose(popup);
        authPopup.current = null;
        await finishConnection();
      } else {
        authPending.current = false;
        setAuthUrl(result.connect_link_url);
        showNotice("Браузер заблокировал окно. Откройте авторизацию по ссылке ниже.");
      }
    } catch (cause) {
      authPending.current = false;
      authPopup.current = null;
      setAuthUrl("");
      if (popup && !popup.closed) popup.close();
      setConnecting(null);
      setError(cause instanceof Error ? cause.message : "Не удалось подключить почту. Попробуйте ещё раз.");
    }
  }

  if (loading || pathname === "/mail" || (pathname === "/mail/inbox" && !accounts.length)) return <main className={s.mail}>{error ? <><ErrorBanner message={error} onClose={() => setError("")} /><button className={s.inboxLink} type="button" onClick={() => { setError(""); setLoading(true); setRetry((value) => value + 1); }}>Повторить</button></> : <div className={s.loading}><LoaderCircle className={s.spinner} /> Проверяем подключённые аккаунты...</div>}</main>;
  if (pathname === "/mail/inbox") {
    if (!accounts.length) return <main className={s.mail}><div className={s.loading}>Переход к подключению почты...</div></main>;
    return <MailInbox accounts={accounts} reauthAccounts={reauthAccounts} onMenu={onMenu} onConnect={() => router.push("/mail/connect")} onDisconnect={disconnectAccount} />;
  }

  return <main className={s.mail}>
    <header className={s.header}>
      <button className={s.mobileMenu} type="button" aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
      <div><h1>Почта</h1><p>Подключите рабочие и личные почтовые аккаунты</p></div>
      {accounts.length > 0 && <button className={s.inboxLink} type="button" onClick={() => router.push("/mail/inbox")}>Перейти к письмам</button>}
    </header>
    {error && <ErrorBanner message={error} onClose={() => setError("")} />}
    {!error && reauthAccounts.length > 0 && <ErrorBanner message="Почтовый аккаунт требует повторного подключения. Выберите его провайдера ниже." onClose={() => setReauthAccounts([])} />}
    {reauthAccounts.map((account) => <button className={s.inboxLink} type="button" key={account.id} onClick={() => {
      if (!window.confirm(`Удалить старое подключение ${account.email}? Сохранённые письма этого аккаунта будут удалены.`)) return;
      void disconnectAccount(account.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Не удалось отключить аккаунт."));
    }}>Отключить {account.email} перед новым входом</button>)}
    {authUrl && <div className={s.authFallback}><span>Для завершения подключения откройте авторизацию в новой вкладке.</span><a href={authUrl} target="_blank" rel="noopener noreferrer" onClick={() => { authPending.current = true; }}>Открыть авторизацию</a></div>}
    <section className={s.connectView}>
      <div className={s.intro}><Mail aria-hidden="true" /><h2>Подключите почту</h2><p>Подключите Gmail, Outlook, Яндекс Почту или Mail.ru,<br />чтобы работать с письмами внутри Workspace AI.</p></div>
      <div className={s.providerGrid}>{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} loading={connecting === provider.id} disabled={connecting !== null} onConnect={() => void connect(provider)} />)}</div>
      <div className={s.primaryArea}><button className={s.primaryButton} type="button" onClick={() => setSelectorOpen(true)} disabled={connecting !== null}><Plus />Подключить почту</button><p>Вы можете подключить несколько аккаунтов</p></div>
    </section>
    {selectorOpen && <div className={s.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectorOpen(false); }}><section className={s.providerDialog} role="dialog" aria-modal="true" aria-labelledby="mail-provider-title"><div className={s.dialogHeader}><h2 id="mail-provider-title">Выберите почтовый сервис</h2><button type="button" aria-label="Закрыть" onClick={() => setSelectorOpen(false)}><X /></button></div><div className={s.dialogProviders}>{providers.map((provider) => <button type="button" key={provider.id} onClick={() => void connect(provider)}><span className={s.dialogLogoSlot}><Image className={square(provider.id) ? s.roundedLogo : undefined} src={provider.icon} alt="" width={40} height={40} /></span><span><strong>{provider.name}</strong><small>{provider.description}</small></span></button>)}</div></section></div>}
    {notice && <div className={s.toast} role="status">{notice}</div>}
  </main>;
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) { return <div className={s.error} role="alert"><AlertCircle /><span>{message}</span><button type="button" aria-label="Закрыть сообщение" onClick={onClose}><X /></button></div>; }
function ProviderCard({ provider, loading, disabled, onConnect }: { provider: Provider; loading: boolean; disabled: boolean; onConnect: () => void }) { return <article className={s.providerCard}><span className={s.providerLogoSlot}><Image className={square(provider.id) ? s.roundedLogo : undefined} src={provider.icon} alt={`Логотип ${provider.name}`} width={44} height={44} /></span><h3>{provider.name}</h3><p>{provider.description}</p><button type="button" disabled={disabled} onClick={onConnect} aria-label={`Подключить ${provider.name}`}>{loading && <LoaderCircle className={s.spinner} />} {loading ? "Ожидаем авторизацию..." : "Подключить"}</button></article>; }
function waitForPopupClose(popup: Window) { return new Promise<void>((resolve) => { const timer = window.setInterval(() => { if (popup.closed) { window.clearInterval(timer); resolve(); } }, 500); }); }
function square(provider: ProviderId) { return provider === "yandex" || provider === "mailru"; }
