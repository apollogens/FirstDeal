import s from "../HistoryV2.module.css";

export function HistorySkeleton() {
  return <div className={s.skeleton} aria-label="Загрузка истории">{Array.from({ length: 6 }, (_, index) => <div key={index}><span /><span /><span /></div>)}</div>;
}
