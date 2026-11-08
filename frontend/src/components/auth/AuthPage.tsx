import { LoginCard } from "./LoginCard";
import { NeonTicker } from "./NeonTicker";
import { RestoreHeart } from "./RestoreHeart";
import s from "./Auth.module.css";

function FloatingBackground() {
  return (
    <div className={s.auth__background} aria-hidden="true">
      <div className={s.auth__ambient} />
      <svg className={s.auth__orbits} viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <ellipse cx="770" cy="450" rx="720" ry="215" />
        <ellipse cx="1180" cy="845" rx="650" ry="185" />
      </svg>
      <div className={s.auth__leftBloom} />
      <div className={s.auth__grain} />
    </div>
  );
}

function BrandLogo() {
  return (
    <div className={s.auth__brand}>
      <div className={s.auth__logoPlate}><strong className={s.auth__neutralLogo}>Workspace AI</strong></div>
      <p>Твой личный AI-агент</p>
    </div>
  );
}

export function AuthPage() {
  return (
    <main className={s.auth}>
      <FloatingBackground />
      <NeonTicker />
      <div className={s.auth__peripheral} aria-hidden="true">
        <div className={s.auth__upperBrand}><strong>Workspace AI</strong><span>AI AGENT</span></div>
        <div className={s.auth__leftStatement}>Больше<br />времени<br />для главного</div>
        <div className={s.auth__rightStatement}>AI<br />for what<br />matters<i /></div>
        <div className={s.auth__signal}><b>⌁</b><span>Технологии,<br />которые возвращают время</span></div>
        <div className={s.auth__signature}><strong>Workspace AI</strong><RestoreHeart /><span>создано<br />с AI</span><i /></div>
      </div>
      <div className={s.auth__badgeScene}>
        <div className={s.auth__lanyard} aria-hidden="true">
          <div className={s.auth__strap}><span><RestoreHeart />Workspace AI</span></div>
          <div className={s.auth__metalRing} />
          <div className={s.auth__connector} />
          <div className={s.auth__snapHook}><i /></div>
        </div>
        <LoginCard>
          <BrandLogo />
        </LoginCard>
      </div>
    </main>
  );
}
