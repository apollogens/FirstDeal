import { RestoreHeart } from "./RestoreHeart";
import s from "./Auth.module.css";

const TICKER_TEXT = "Workspace AI — твой AI агент на каждый день";

export function NeonTicker() {
  return (
    <div className={s.auth__ticker} aria-hidden="true">
      <div>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index}>{TICKER_TEXT}<RestoreHeart /></span>
        ))}
      </div>
    </div>
  );
}
