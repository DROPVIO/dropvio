"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { ONBOARDING_STEPS, type OnboardingStep } from "./onboarding-steps";

interface OnboardingContextValue {
  active: boolean;
  step: OnboardingStep | null;
  stepIndex: number;
  totalSteps: number;
  next: () => void;
  prev: () => void;
  skip: () => void;
  /** Relance le tutoriel manuellement (ex: depuis les paramètres), sans jamais se redéclencher tout seul ensuite. */
  restart: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding doit être utilisé sous OnboardingProvider");
  return ctx;
}

export default function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user || cancelled) return;
      setUserId(user.id);

      supabase
        .from("profils")
        .select("onboarding_termine")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data: profil }) => {
          if (cancelled) return;
          // Pas de ligne profils -> compte tout juste créé, jamais onboardé.
          const dejaVu = profil?.onboarding_termine ?? false;
          if (!dejaVu) {
            setStepIndex(0);
            setActive(true);
          }
        });
    });

    return () => { cancelled = true; };
  }, []);

  const markDone = useCallback(async (id: string) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("profils").upsert({ id, onboarding_termine: true });
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    if (userId) markDone(userId);
  }, [userId, markDone]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i + 1 >= ONBOARDING_STEPS.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const restart = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const value = useMemo<OnboardingContextValue>(() => ({
    active,
    step: active ? ONBOARDING_STEPS[stepIndex] : null,
    stepIndex,
    totalSteps: ONBOARDING_STEPS.length,
    next,
    prev,
    skip: finish,
    restart,
  }), [active, stepIndex, next, prev, finish, restart]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}
