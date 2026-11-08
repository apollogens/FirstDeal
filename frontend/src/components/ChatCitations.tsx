"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChatMessageCitation } from "@/lib/chats";
import { presentChatCitations, type DisplayCitation } from "@/lib/chat-citation-presentation";
import s from "./ChatCitations.module.css";

const INITIAL_COUNT = 4;

export function ChatCitations({ citations, timeZone }: { citations: ChatMessageCitation[]; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const facts = presentChatCitations(citations, timeZone);
  if (!facts.length) return null;

  const current = facts.filter((fact) => !fact.historical);
  const history = facts.filter((fact) => fact.historical);
  const visible = current.slice(0, showAll ? undefined : INITIAL_COUNT);
  const hiddenCount = current.length - visible.length;

  function toggleFact(id: string) {
    setExpanded((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  return <section className={s.block} aria-label="Связанные сведения">
    <button className={s.toggle} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span>Связанные сведения <span className={s.count}>· {facts.length}</span></span>
      <ChevronDown className={open ? s.rotated : ""} aria-hidden="true" />
    </button>
    {open && <div className={s.content}>
      <p className={s.explanation}>Найдено в памяти и результатах действий. Не каждое сведение обязательно вошло в ответ.</p>
      {visible.length > 0 && <CitationGroups facts={visible} expanded={expanded} onToggle={toggleFact} />}
      {hiddenCount > 0 && <button className={s.more} type="button" onClick={() => setShowAll(true)}>Показать ещё {hiddenCount}</button>}
      {showAll && current.length > INITIAL_COUNT && <button className={s.more} type="button" onClick={() => setShowAll(false)}>Свернуть список</button>}
      {history.length > 0 && <div className={s.history}>
        <button type="button" className={s.historyToggle} aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}><ChevronRight className={showHistory ? s.historyOpen : ""} />История изменений · {history.length}</button>
        {showHistory && <CitationGroups facts={history} expanded={expanded} onToggle={toggleFact} />}
      </div>}
    </div>}
  </section>;
}

function CitationGroups({ facts, expanded, onToggle }: { facts: DisplayCitation[]; expanded: string[]; onToggle: (id: string) => void }) {
  const groups = new Map<string, DisplayCitation[]>();
  for (const fact of facts) groups.set(fact.group, [...(groups.get(fact.group) ?? []), fact]);
  return <div className={s.groups}>{[...groups].map(([group, items]) => <section className={s.group} key={group}>
    <h3>{group}</h3>
    <div className={s.groupRows}>{items.map((fact) => {
      const isExpanded = expanded.includes(fact.id);
      return <article className={s.fact} key={fact.id}>
        {fact.validity ? <button className={s.factToggle} type="button" aria-expanded={isExpanded} onClick={() => onToggle(fact.id)}>
          <span className={s.factText}><strong>{fact.title}</strong><span className={s.value}>{fact.value}</span><small>{fact.source}{fact.sourceDate ? ` · ${fact.sourceDate}` : ""}</small></span>
          <ChevronDown className={isExpanded ? s.rotated : ""} aria-hidden="true" />
        </button> : <div className={s.factRow}><span className={s.factText}><strong>{fact.title}</strong><span className={s.value}>{fact.value}</span><small>{fact.source}{fact.sourceDate ? ` · ${fact.sourceDate}` : ""}</small></span></div>}
        {isExpanded && fact.validity && <div className={s.details}><span>{fact.validity}</span></div>}
      </article>;
    })}</div>
  </section>)}</div>;
}
