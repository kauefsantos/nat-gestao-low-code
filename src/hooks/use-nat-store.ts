import { useCallback, useEffect, useMemo, useState } from "react";
import { initialState, type NatState } from "@/domain/nat";
import { useAuth } from "@/hooks/use-auth";

function parseState(raw: string | null): NatState {
  if (!raw) return initialState;
  try {
    const parsed = JSON.parse(raw) as Partial<NatState>;
    if (parsed.version !== 2) return initialState;
    return {
      ...initialState,
      ...parsed,
      settings: { ...initialState.settings, ...(parsed.settings ?? {}) },
      supplies: Array.isArray(parsed.supplies) ? parsed.supplies : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      version: 2,
    };
  } catch {
    return initialState;
  }
}

export function useNatStore() {
  const { user } = useAuth();
  const storageKey = useMemo(() => `nat-gestao-v2:${user?.id ?? "local"}`, [user?.id]);
  const [state, setState] = useState<NatState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
    setState(parseState(raw));
    setReady(true);
  }, [storageKey]);

  const update = useCallback((recipe: (current: NatState) => NatState) => {
    setState((current) => {
      const next = recipe(current);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return next;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    setState(initialState);
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { state, update, reset, ready };
}