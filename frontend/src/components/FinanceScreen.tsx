"use client";

import { expenseChartBackground } from "@/lib/portfolio-presentation";
import { useActionMenu } from "./useActionMenu";
import { useDialogFocus } from "./useDialogFocus";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  CircleGauge,
  Download,
  Ellipsis,
  Info,
  Laptop,
  Menu,
  Plus,
  Search,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createCategory,
  createTransaction,
  deleteCategory,
  deleteGoal,
  deleteTransaction,
  FinanceApiError,
  type FinanceCategory,
  type FinancialGoal,
  type FinanceScope,
  type FinanceSummary,
  type FinanceTransaction,
  type FinanceType,
  getCategories,
  getFinanceSummary,
  getGoals,
  getTransactions,
  type TransactionPayload,
  updateCategory,
  updateTransaction,
} from "@/lib/finance";
import s from "./Finance.module.css";
import { RestoreDatePicker, RestoreDateRangePicker } from "./RestoreDateTimePickers";
import { RestoreSelect } from "./RestoreSelect";
import { SegmentedControl } from "./SegmentedControl";

type ContextTab = "categories" | "insights";
type FinanceView = "overview" | "goals";
type ScopeLabel = "Все" | "Работа" | "Личное";
type TypeLabel = "Все операции" | "Расход" | "Доход";
type DialogKind = "transaction" | "category" | null;
type CategoryTone = "strong" | "medium" | "light";
type CategoryStat = {
  category: FinanceCategory;
  amount: number;
  percent: number;
  tone: CategoryTone;
};

const PAGE_SIZE = 20;
const ANALYSIS_LIMIT = 100;
const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = (value: number) => `${rub.format(value)} ₽`;
const numberValue = (value: string) => Number.parseFloat(value) || 0;
const localDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const today = localDate(new Date());
const monthStart = `${today.slice(0, 8)}01`;
const shortDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
const scopeToApi = (value: ScopeLabel): FinanceScope | undefined =>
  value === "Работа" ? "work" : value === "Личное" ? "personal" : undefined;
const typeToApi = (value: TypeLabel): FinanceType | undefined =>
  value === "Расход" ? "expense" : value === "Доход" ? "income" : undefined;
const scopeLabel = (value: FinanceScope) => (value === "work" ? "Работа" : "Личное");
const typeLabel = (value: FinanceType) => (value === "expense" ? "Расход" : "Доход");
const errorMessage = (error: unknown) =>
  error instanceof FinanceApiError
    ? error.message
    : "Не удалось выполнить запрос. Попробуйте ещё раз.";

function SelectControl({
  label,
  value,
  values,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`${s.finance__restoreSelectWrap} ${compact ? s["finance__select--compact"] : ""}`}>
      <RestoreSelect
        label={label}
        value={value}
        options={values.map((item) => ({ value: item, label: item }))}
        onChange={onChange}
        showLabel
        variant="filter"
      />
    </div>
  );
}

export function FinanceScreen({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: FinanceView = searchParams.get("view") === "goals" ? "goals" : "overview";
  const [contextTab, setContextTab] = useState<ContextTab>("categories");
  const [contextOpen, setContextOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [scope, setScope] = useState<ScopeLabel>("Все");
  const [type, setType] = useState<TypeLabel>("Все операции");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [analysisTransactions, setAnalysisTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>({ currency: "RUB", income: "0", expense: "0", balance: "0" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransaction | null>(null);
  const [editingCategory, setEditingCategory] = useState<FinanceCategory | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (periodStart > periodEnd) {
        setError("Дата начала периода не может быть позже даты окончания.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      const commonFilters = {
        scope: scopeToApi(scope),
        date_from: periodStart,
        date_to: periodEnd,
      };
      try {
        const [nextSummary, pageItems, analysisItems, nextCategories, nextGoals] = await Promise.all([
          getFinanceSummary(commonFilters, controller.signal),
          getTransactions(
            {
              ...commonFilters,
              type: typeToApi(type),
              limit: PAGE_SIZE + 1,
              offset: page * PAGE_SIZE,
            },
            controller.signal,
          ),
          getTransactions(
            { ...commonFilters, limit: ANALYSIS_LIMIT, offset: 0 },
            controller.signal,
          ),
          getCategories(undefined, controller.signal),
          getGoals(scopeToApi(scope), undefined, controller.signal).catch(() => []),
        ]);
        setSummary(nextSummary);
        setTransactions(pageItems.slice(0, PAGE_SIZE));
        setHasMore(pageItems.length > PAGE_SIZE);
        setAnalysisTransactions(analysisItems);
        setCategories(nextCategories);
        setGoals(nextGoals || []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(errorMessage(loadError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, periodEnd, periodStart, refreshVersion, scope, type]);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const visibleTransactions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    if (!needle) return transactions;
    return transactions.filter((item) =>
      `${categoryNames.get(item.category_id) ?? ""} ${item.description} ${scopeLabel(item.scope)} ${item.date}`
        .toLocaleLowerCase("ru")
        .includes(needle),
    );
  }, [categoryNames, query, transactions]);
  const categoryStats = useMemo<CategoryStat[]>(() => {
    const amounts = new Map<string, number>();
    for (const transaction of analysisTransactions) {
      amounts.set(
        transaction.category_id,
        (amounts.get(transaction.category_id) ?? 0) + numberValue(transaction.amount),
      );
    }
    const totalExpense = analysisTransactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + numberValue(item.amount), 0);
    return categories
      .map((category) => {
        const amount = amounts.get(category.id) ?? 0;
        const percent = category.type === "expense" && totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
        return { category, amount, percent, tone: "light" };
      })
      .sort((left, right) => right.amount - left.amount)
      .map((item, index) => ({ ...item, tone: index === 0 ? "strong" : index === 1 ? "medium" : "light" }));
  }, [analysisTransactions, categories]);
  const expenseStats = categoryStats.filter((item) => item.category.type === "expense" && item.amount > 0);
  const topExpense = expenseStats[0];

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function refresh() {
    setRefreshVersion((value) => value + 1);
  }

  function changeScope(value: string) {
    setScope(value as ScopeLabel);
    setPage(0);
  }

  function changeTypeFilter(value: string) {
    setType(value as TypeLabel);
    setPage(0);
  }

  function exportCsv() {
    const rows = [
      ["Дата", "Категория", "Описание", "Тип", "Область", "Сумма", "Валюта"],
      ...visibleTransactions.map((item) => [
        item.date,
        categoryNames.get(item.category_id) ?? "Категория недоступна",
        item.description,
        typeLabel(item.type),
        scopeLabel(item.scope),
        item.amount,
        item.currency,
      ]),
    ];
    const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const blob = new Blob(
      [`\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\n")}`],
      { type: "text/csv;charset=utf-8" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `restore-finance-${periodStart}-${periodEnd}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Экспорт подготовлен");
  }

  async function saveTransaction(payload: TransactionPayload) {
    setActionBusy(true);
    setDialogError("");
    try {
      if (editingTransaction) await updateTransaction(editingTransaction.id, payload);
      else await createTransaction(payload);
      setDialog(null);
      setEditingTransaction(null);
      refresh();
      notify(editingTransaction ? "Транзакция обновлена" : "Транзакция добавлена");
    } catch (saveError) {
      setDialogError(errorMessage(saveError));
    } finally {
      setActionBusy(false);
    }
  }

  async function removeTransaction(item: FinanceTransaction) {
    if (!window.confirm("Удалить эту транзакцию?")) return;
    setBusyId(item.id);
    setOpenRow(null);
    try {
      await deleteTransaction(item.id);
      refresh();
      notify("Транзакция удалена");
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusyId(null);
    }
  }

  async function saveCategory(name: string, categoryType: FinanceType) {
    setActionBusy(true);
    setDialogError("");
    try {
      if (editingCategory) await updateCategory(editingCategory.id, { name, type: categoryType });
      else await createCategory({ name, type: categoryType });
      setDialog(null);
      setEditingCategory(null);
      refresh();
      notify(editingCategory ? "Категория обновлена" : "Категория создана");
    } catch (saveError) {
      setDialogError(errorMessage(saveError));
    } finally {
      setActionBusy(false);
    }
  }

  async function removeCategory(category: FinanceCategory) {
    if (!window.confirm(`Удалить категорию «${category.name}»?`)) return;
    setBusyId(category.id);
    try {
      await deleteCategory(category.id);
      refresh();
      notify("Категория удалена");
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={`${s.finance} ${contextOpen ? "" : s["finance--contextClosed"]}`}>
      <section className={s.finance__workspace}>
        <header className={s.finance__pageHeader}>
          <button className={s.finance__mobileMenu} aria-label="Открыть меню" onClick={onMenu}><Menu /></button>
          <div>
            <h1>{view === "overview" ? "Финансы" : "Мои цели"}</h1>
            <p>{view === "overview" ? "Доходы, расходы и транзакции" : "Финансовые цели и прогресс накоплений"}</p>
          </div>
          <div className={s.finance__headerActions}>
            {!contextOpen && <button className={s.finance__iconButton} aria-label="Открыть контекст" onClick={() => setContextOpen(true)}><Info /></button>}
            {view === "overview" && <button className={s.finance__primaryButton} data-finance-create type="button" onClick={() => { setEditingTransaction(null); setDialogError(""); setDialog("transaction"); }}><Plus />Добавить транзакцию</button>}
          </div>
        </header>

        <SegmentedControl
          ariaLabel="Раздел финансов"
          value={view}
          options={[{ value: "overview", label: "Обзор" }, { value: "goals", label: "Мои цели" }]}
          onChange={(next) => router.push(next === "overview" ? "/workspace?section=finance" : "/workspace?section=finance&view=goals")}
          className={s.finance__financeNavigation}
        />

        {error && <div className={s.finance__notice} role="alert"><AlertCircle /><div><strong>Не удалось обновить финансы</strong><span>{error}</span></div></div>}

        {view === "goals" ? (
          <section className={s.finance__goalsPage}>
            {goals.length === 0 ? (
              <article className={s.finance__goalTile}>
                <header><div><span>Цели</span><h2>Нет активных целей</h2></div></header>
                <p className={s.finance__emptyState}>У вас пока нет финансовых целей. Вы можете поставить цель через чат с агентом (например: «Поставь цель накопить 100 000 руб на отпуск»).</p>
              </article>
            ) : (
              goals.map((g) => (
                <article key={g.id} className={s.finance__goalTile}>
                  <header>
                    <div>
                      <span>{g.scope === "work" ? "Работа" : "Личное"}{g.is_completed ? " • Достигнута" : ""}</span>
                      <h2>{g.title}</h2>
                    </div>
                  </header>
                  <dl>
                    <div>
                      <dt>Цель</dt>
                      <dd>{money(Number(g.target_amount))}</dd>
                    </div>
                    <div>
                      <dt>Накоплено</dt>
                      <dd>{money(Number(g.current_amount))}</dd>
                    </div>
                    <div>
                      <dt>Прогресс</dt>
                      <dd>{g.progress_percent}%</dd>
                    </div>
                    <div>
                      <dt>Осталось</dt>
                      <dd>{money(Number(g.remaining_amount))}</dd>
                    </div>
                  </dl>
                  <footer>
                    <button
                      type="button"
                      className={s.finance__dangerAction}
                      onClick={() => {
                        setError("");
                        deleteGoal(g.id)
                          .then(() => setGoals((prev) => prev.filter((item) => item.id !== g.id)))
                          .catch((error: unknown) => setError(errorMessage(error)));
                      }}
                    >
                      Удалить
                    </button>
                  </footer>
                </article>
              ))
            )}
          </section>
        ) : <>
          <div className={s.finance__toolbar} aria-label="Фильтры финансов">
            <RestoreDateRangePicker label="Период" startValue={periodStart} endValue={periodEnd} onStartChange={(value) => { setPeriodStart(value); setPage(0); }} onEndChange={(value) => { setPeriodEnd(value); setPage(0); }} />
            <div className={s.finance__currency}><span>Валюта</span><strong>RUB</strong></div>
            <SelectControl label="Область" value={scope} values={["Все", "Работа", "Личное"]} onChange={changeScope} />
            <SelectControl label="Операции" value={type} values={["Все операции", "Расход", "Доход"]} onChange={changeTypeFilter} />
          </div>

          <section className={s.finance__summaryGrid} aria-label="Финансовая сводка">
            <article className={s.finance__summaryCard}><span className={`${s.finance__summaryIcon} ${s.finance__incomeIcon}`}><ArrowUp /></span><div><p>Доходы</p><strong>{money(numberValue(summary.income))}</strong><small>за выбранный период</small></div></article>
            <article className={s.finance__summaryCard}><span className={`${s.finance__summaryIcon} ${s.finance__expenseIcon}`}><ArrowDown /></span><div><p>Расходы</p><strong>{money(numberValue(summary.expense))}</strong><small>за выбранный период</small></div></article>
            <article className={`${s.finance__summaryCard} ${s.finance__goalCard}`}><span className={`${s.finance__summaryIcon} ${s.finance__goalIcon}`}><Target /></span><div><p>Баланс</p><strong>{money(numberValue(summary.balance))}</strong><small>доходы минус расходы</small></div></article>
          </section>

          <section className={s.finance__insightsSection}>
            <div className={s.finance__sectionIntro}><h2>Аналитика</h2><p>Расчёт по реальным операциям за выбранный период</p></div>
            <div className={s.finance__insightsGrid}>
              <article className={s.finance__structureCard}>
                <header><h3>Структура расходов</h3><strong>{money(numberValue(summary.expense))}</strong></header>
                <div className={s.finance__structureBody}>
                  <div className={s.finance__donut} style={{ backgroundImage: expenseChartBackground(numberValue(summary.expense), expenseStats.map(item => item.amount)) ?? "none" }} role="img" aria-label={`Расходы ${money(numberValue(summary.expense))}`}><span><strong>{money(numberValue(summary.expense))}</strong><small>{numberValue(summary.expense) === 0 ? "Нет расходов" : "всего"}</small></span></div>
                  <div className={s.finance__legend}>
                    {expenseStats.slice(0, 3).map((item) => <div key={item.category.id}><i className={s[`finance__indicator--${item.tone}`]} /><span>{item.category.name}</span><small>{Math.round(item.percent)}%</small><strong>{money(item.amount)}</strong></div>)}
                    {!expenseStats.length && <p className={s.finance__emptyState}>Нет расходов за период</p>}
                  </div>
                </div>
              </article>
              <div className={s.finance__insightList}>
                <article className={s.finance__insightRow}><TrendingUp /><p>Баланс за период: {money(numberValue(summary.balance))}.</p></article>
                {topExpense && <article className={s.finance__insightRow}><CircleGauge /><p>Крупнейшая категория расходов — «{topExpense.category.name}»: {Math.round(topExpense.percent)}% среди загруженных операций.</p></article>}
                {analysisTransactions.length === ANALYSIS_LIMIT && <article className={s.finance__insightRow}><Info /><p>Для структуры категорий учтены первые {ANALYSIS_LIMIT} операций. Итоговая сводка рассчитана backend полностью.</p></article>}
              </div>
            </div>
            <footer className={s.finance__analysisFoot}>Сводка рассчитана backend <Info /></footer>
          </section>

          <section className={s.finance__transactionsSection}>
            <header className={s.finance__sectionHeader}><h2>Транзакции</h2><button className={s.finance__secondaryButton} type="button" onClick={exportCsv} disabled={!visibleTransactions.length}><Download />Экспорт страницы</button></header>
            <div className={s.finance__tableTools}>
              <label className={s.finance__search}><Search /><input aria-label="Поиск транзакций" placeholder="Поиск на странице" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <SelectControl compact label="Операции" value={type} values={["Все операции", "Расход", "Доход"]} onChange={changeTypeFilter} />
              <SelectControl compact label="Область" value={scope} values={["Все", "Работа", "Личное"]} onChange={changeScope} />
              {(query || scope !== "Все" || type !== "Все операции") && <button className={s.finance__clearFilters} onClick={() => { setQuery(""); setScope("Все"); setType("Все операции"); setPage(0); }}>Сбросить</button>}
            </div>
            <div className={s.finance__tableWrap} role="region" aria-label="Транзакции: горизонтальная прокрутка" tabIndex={0}>
              <table><thead><tr><th>Дата</th><th>Категория</th><th>Описание</th><th>Тип</th><th>Область</th><th>Сумма</th><th>Действия</th></tr></thead><tbody>
                {visibleTransactions.map((transaction) => {
                  const categoryName = categoryNames.get(transaction.category_id) ?? "Категория недоступна";
                  return <tr key={transaction.id}>
                    <td>{shortDate(transaction.date)}</td>
                    <td><span className={s.finance__tableCategoryIcon}><Laptop /></span>{categoryName}</td>
                    <td>{transaction.description || "—"}</td>
                    <td><span className={transaction.type === "expense" ? s.finance__expenseBadge : s.finance__incomeBadge}>{typeLabel(transaction.type)}</span></td>
                    <td>{scopeLabel(transaction.scope)}</td>
                    <td><span className={transaction.type === "expense" ? s.finance__amount : s.finance__amountIncome}>{transaction.type === "expense" ? "−" : "+"} {money(numberValue(transaction.amount))}</span></td>
                    <td className={s.finance__actionsCell}><TransactionActions open={openRow === transaction.id} onClose={() => setOpenRow(null)}><button className={s.finance__rowMenu} data-transaction-menu={transaction.id} aria-label={`Действия транзакции: ${categoryName}`} aria-haspopup="menu" aria-expanded={openRow === transaction.id} disabled={busyId === transaction.id} onClick={() => setOpenRow(openRow === transaction.id ? null : transaction.id)}><Ellipsis /></button>{openRow === transaction.id && <div data-anchored-popover className={s.finance__rowPopover} role="menu"><button role="menuitem" onClick={() => { setEditingTransaction(transaction); setDialogError(""); setDialog("transaction"); setOpenRow(null); }}>Изменить</button><button role="menuitem" onClick={() => void removeTransaction(transaction)}>Удалить</button></div>}</TransactionActions></td>
                  </tr>;
                })}
              </tbody></table>
              {!loading && !visibleTransactions.length && <p className={s.finance__emptyState}>По выбранным фильтрам ничего не найдено</p>}
              {loading && <p className={s.finance__emptyState}>Загрузка операций…</p>}
            </div>
            <footer className={s.finance__pagination}><span>Страница {page + 1}</span><button disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Назад</button><button disabled={!hasMore || loading} onClick={() => setPage((value) => value + 1)}>Далее</button></footer>
          </section>
        </>}
      </section>

      {contextOpen && <aside className={s.finance__contextPanel} aria-label="Контекст финансов">
        <header><div><h2>Контекст</h2><p>Категории и аналитика</p></div><button aria-label="Закрыть контекст" onClick={() => setContextOpen(false)}><X /></button></header>
        <div className={s.finance__contextTabs} role="tablist" aria-label="Разделы контекста">
          {([["categories", "Категории"], ["insights", "Аналитика"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={contextTab === value} className={contextTab === value ? s["finance__contextTab--active"] : ""} onClick={() => setContextTab(value)}>{label}</button>)}
        </div>
        {contextTab === "categories" && <div className={s.finance__contextContent}><CategoryBreakdown stats={categoryStats} busyId={busyId} onEdit={(category) => { setEditingCategory(category); setDialogError(""); setDialog("category"); }} onDelete={(category) => void removeCategory(category)} /><button className={s.finance__createCategory} data-finance-create-category type="button" onClick={() => { setEditingCategory(null); setDialogError(""); setDialog("category"); }}><Plus />Создать категорию</button></div>}
        {contextTab === "insights" && <div className={`${s.finance__contextContent} ${s.finance__contextInsights}`}><article><TrendingUp /><p>Доходы: {money(numberValue(summary.income))}</p></article><article><ArrowDown /><p>Расходы: {money(numberValue(summary.expense))}</p></article><article><CircleGauge /><p>Баланс: {money(numberValue(summary.balance))}</p></article></div>}
      </aside>}

      {dialog === "transaction" && <TransactionDialog categories={categories} transaction={editingTransaction} busy={actionBusy} error={dialogError} onClose={() => { setDialog(null); setEditingTransaction(null); setDialogError(""); }} onSave={saveTransaction} />}
      {dialog === "category" && <CategoryDialog category={editingCategory} busy={actionBusy} error={dialogError} onClose={() => { setDialog(null); setEditingCategory(null); setDialogError(""); }} onSave={saveCategory} />}
      {toast && <div className={s.finance__toast} role="status">{toast}</div>}
    </main>
  );
}

function TransactionDialog({
  categories,
  transaction,
  busy,
  error,
  onClose,
  onSave,
}: {
  categories: FinanceCategory[];
  transaction: FinanceTransaction | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: TransactionPayload) => Promise<void>;
}) {
  useDialogFocus(true, '[aria-labelledby="transaction-title"]', () => { if (!busy) onClose(); }, transaction ? `[data-transaction-menu="${CSS.escape(transaction.id)}"]` : "[data-finance-create]");
  const [transactionType, setTransactionType] = useState<FinanceType>(transaction?.type ?? "expense");
  const matchingCategories = categories.filter((item) => item.type === transactionType);
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? matchingCategories[0]?.id ?? "");
  const [transactionScope, setTransactionScope] = useState<FinanceScope>(transaction?.scope ?? "personal");
  const [transactionDate, setTransactionDate] = useState(transaction?.date ?? today);

  function changeType(value: string) {
    const nextType = value as FinanceType;
    setTransactionType(nextType);
    if (!categories.some((item) => item.id === categoryId && item.type === nextType)) {
      setCategoryId(categories.find((item) => item.type === nextType)?.id ?? "");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId) return;
    const data = new FormData(event.currentTarget);
    void onSave({
      category_id: categoryId,
      scope: transactionScope,
      amount: Number(data.get("amount")).toFixed(2),
      currency: "RUB",
      type: transactionType,
      date: transactionDate,
      description: String(data.get("description") ?? "").trim(),
    });
  }

  return <div className={s.finance__dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className={s.finance__dialog} role="dialog" aria-modal="true" aria-labelledby="transaction-title"><header><h2 id="transaction-title">{transaction ? "Изменить транзакцию" : "Новая транзакция"}</h2><button aria-label="Закрыть" disabled={busy} onClick={onClose}><X /></button></header><form onSubmit={submit}>
    <label><span>Сумма</span><input name="amount" type="number" min="0.01" step="0.01" required autoFocus defaultValue={transaction?.amount} placeholder="0,00" /></label>
    <div className={s.finance__dialogField}><span>Тип</span><RestoreSelect label="Тип" showLabel={false} value={transactionType} options={[{ value: "expense", label: "Расход" }, { value: "income", label: "Доход" }]} onChange={changeType} /></div>
    <div className={s.finance__dialogField}><span>Категория</span>{matchingCategories.length ? <RestoreSelect label="Категория" showLabel={false} value={categoryId} options={matchingCategories.map((item) => ({ value: item.id, label: item.name }))} onChange={setCategoryId} /> : <p className={s.finance__formError}>Сначала создайте категорию типа «{typeLabel(transactionType)}».</p>}</div>
    <div className={s.finance__dialogField}><span>Область</span><RestoreSelect label="Область" showLabel={false} value={transactionScope} options={[{ value: "personal", label: "Личное" }, { value: "work", label: "Работа" }]} onChange={(value) => setTransactionScope(value)} /></div>
    <div className={s.finance__dialogField}><span>Дата</span><RestoreDatePicker label="Дата транзакции" value={transactionDate} onChange={setTransactionDate} allowClear={false} /></div>
    <label><span>Описание</span><input name="description" maxLength={1000} defaultValue={transaction?.description} placeholder="Необязательно" /></label>
    {error && <p className={s.finance__formError} role="alert">{error}</p>}
    <footer><button type="button" className={s.finance__secondaryButton} disabled={busy} onClick={onClose}>Отмена</button><button className={s.finance__primaryButton} disabled={busy || !categoryId}>{busy ? "Сохраняю…" : transaction ? "Сохранить" : "Добавить"}</button></footer>
  </form></section></div>;
}

function CategoryDialog({
  category,
  busy,
  error,
  onClose,
  onSave,
}: {
  category: FinanceCategory | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (name: string, type: FinanceType) => Promise<void>;
}) {
  useDialogFocus(true, '[aria-labelledby="category-title"]', () => { if (!busy) onClose(); }, category ? `[data-category-edit="${CSS.escape(category.id)}"]` : '[data-finance-create-category]');
  const [categoryType, setCategoryType] = useState<FinanceType>(category?.type ?? "expense");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    if (name) void onSave(name, categoryType);
  }
  return <div className={s.finance__dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className={s.finance__dialog} role="dialog" aria-modal="true" aria-labelledby="category-title"><header><h2 id="category-title">{category ? "Изменить категорию" : "Новая категория"}</h2><button aria-label="Закрыть" disabled={busy} onClick={onClose}><X /></button></header><form onSubmit={submit}>
    <label><span>Название</span><input name="name" required autoFocus maxLength={100} defaultValue={category?.name} placeholder="Например, Образование" /></label>
    <div className={s.finance__dialogField}><span>Тип</span><RestoreSelect label="Тип категории" showLabel={false} value={categoryType} options={[{ value: "expense", label: "Расход" }, { value: "income", label: "Доход" }]} onChange={(value) => setCategoryType(value)} /></div>
    {error && <p className={s.finance__formError} role="alert">{error}</p>}
    <footer><button type="button" className={s.finance__secondaryButton} disabled={busy} onClick={onClose}>Отмена</button><button className={s.finance__primaryButton} disabled={busy}>{busy ? "Сохраняю…" : category ? "Сохранить" : "Создать"}</button></footer>
  </form></section></div>;
}

function CategoryBreakdown({
  stats,
  busyId,
  onEdit,
  onDelete,
}: {
  stats: CategoryStat[];
  busyId: string | null;
  onEdit: (category: FinanceCategory) => void;
  onDelete: (category: FinanceCategory) => void;
}) {
  return <section className={s.finance__breakdown}><header><h3>Категории</h3><p>Суммы по загруженным операциям</p></header><div>
    {stats.map((item) => <article key={item.category.id}>
      <span className={s.finance__breakdownIcon}><BriefcaseBusiness /></span>
      <div><header><strong>{item.category.name}</strong><b>{money(item.amount)}</b></header><div className={s.finance__categoryProgress}><span className={s[`finance__indicator--${item.tone}`]} style={{ width: `${Math.min(100, item.percent)}%` }} /></div><small>{typeLabel(item.category.type)}</small></div>
      {item.category.user_id !== null && <span className={s.finance__categoryActions}><button type="button" disabled={busyId === item.category.id} data-category-edit={item.category.id} onClick={() => onEdit(item.category)}>Изменить</button><button type="button" disabled={busyId === item.category.id} onClick={() => onDelete(item.category)}>Удалить</button></span>}
    </article>)}
    {!stats.length && <p className={s.finance__emptyState}>Категорий пока нет</p>}
  </div></section>;
}

function TransactionActions({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useActionMenu(open, root, onClose);
  return <div ref={root}>{children}</div>;
}
