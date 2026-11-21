"use client";

import { useState } from "react";
import Image from "next/image";

// Image principale et, s'il y en a plusieurs, miniatures pour passer de l'une à l'autre.
export default function GalerieProduit({ images, alt, vide }: { images: string[]; alt: string; vide: React.ReactNode }) {
  const [indexActif, setIndexActif] = useState(0);
  const active = images[indexActif] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square rounded-3xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
        {active ? <Image src={active} alt={alt} fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover" /> : vide}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              aria-label={`${alt} ${index + 1}`}
              aria-current={index === indexActif}
              onClick={() => setIndexActif(index)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${index === indexActif ? "border-[var(--accent)]" : "border-[var(--border)]"}`}
            >
              <Image src={image} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
