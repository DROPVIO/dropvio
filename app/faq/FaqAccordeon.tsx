"use client";

import { useState, type ReactNode } from "react";

export type FaqCategorieRendue = { titre: string; items: { q: string; a: ReactNode }[] };

function FaqAccordionItem({ q, a, open, onToggle }: { q: string; a: ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button className="faq-q" onClick={onToggle} aria-expanded={open}>
        <span>{q}</span>
        <span className="faq-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div className="faq-a">
        <div className="faq-a-inner">{a}</div>
      </div>
    </div>
  );
}

// Accordéon de la FAQ : seule partie interactive de la page ; questions et réponses arrivent
// déjà traduites depuis app/faq/page.tsx (composant serveur).
export default function FaqAccordeon({ categories }: { categories: FaqCategorieRendue[] }) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="faq-wrap">
      {categories.map((cat, ci) => (
        <div key={cat.titre} className="faq-category">
          <h2 className="faq-category-title">{cat.titre}</h2>
          <div className="faq-list">
            {cat.items.map((item, ii) => {
              const id = `${ci}-${ii}`;
              return (
                <FaqAccordionItem key={id} q={item.q} a={item.a} open={openItems.has(id)} onToggle={() => toggle(id)} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
