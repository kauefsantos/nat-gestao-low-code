import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EMPTY_WORKSPACE, type NatWorkspace } from "@/lib/nat-business";

const STORAGE_KEY = "nat-gestao-workspace-v1";

function readLocalWorkspace(): NatWorkspace {
  if (typeof window === "undefined") return EMPTY_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_WORKSPACE;
    const parsed = JSON.parse(raw) as Partial<NatWorkspace>;
    return {
      ...EMPTY_WORKSPACE,
      ...parsed,
      settings: { ...EMPTY_WORKSPACE.settings, ...(parsed.settings ?? {}) },
      supplies: Array.isArray(parsed.supplies) ? parsed.supplies : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      version: 1,
    };
  } catch {
    return EMPTY_WORKSPACE;
  }
}

function writeLocalWorkspace(workspace: NatWorkspace) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function useNatWorkspace() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [workspace, setWorkspaceState] = useState<NatWorkspace>(() => readLocalWorkspace());
  const [isLoading, setIsLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<"checking" | "synced" | "local">("checking");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(workspace);

  useEffect(() => {
    latest.current = workspace;
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const local = readLocalWorkspace();

      if (!userId) {
        if (!cancelled) {
          setWorkspaceState(local);
          setCloudStatus("local");
          setIsLoading(false);
        }
        return;
      }

      try {
        const client = supabase as any;
        const { data, error } = await client
          .from("nat_workspace")
          .select("data")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setWorkspaceState(local);
          setCloudStatus("local");
          setIsLoading(false);
          return;
        }

        if (data?.data) {
          const remote = data.data as NatWorkspace;
          const hydrated: NatWorkspace = {
            ...EMPTY_WORKSPACE,
            ...remote,
            settings: { ...EMPTY_WORKSPACE.settings, ...(remote.settings ?? {}) },
            supplies: Array.isArray(remote.supplies) ? remote.supplies : [],
            products: Array.isArray(remote.products) ? remote.products : [],
            sales: Array.isArray(remote.sales) ? remote.sales : [],
            version: 1,
          };
          writeLocalWorkspace(hydrated);
          setWorkspaceState(hydrated);
          setCloudStatus("synced");
        } else {
          await client.from("nat_workspace").upsert({
            user_id: userId,
            data: local,
            updated_at: new Date().toISOString(),
          });
          setWorkspaceState(local);
          setCloudStatus("synced");
        }
      } catch {
        if (!cancelled) {
          setWorkspaceState(local);
          setCloudStatus("local");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persistCloud = useCallback(
    (next: NatWorkspace) => {
      if (!userId || cloudStatus === "local") return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const client = supabase as any;
          const { error } = await client.from("nat_workspace").upsert({
            user_id: userId,
            data: next,
            updated_at: new Date().toISOString(),
          });
          if (error) {
            setCloudStatus("local");
          } else {
            setCloudStatus("synced");
          }
        } catch {
          setCloudStatus("local");
        }
      }, 350);
    },
    [cloudStatus, userId],
  );

  const setWorkspace = useCallback(
    (update: NatWorkspace | ((current: NatWorkspace) => NatWorkspace)) => {
      setWorkspaceState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        latest.current = next;
        writeLocalWorkspace(next);
        persistCloud(next);
        return next;
      });
    },
    [persistCloud],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return {
    workspace,
    setWorkspace,
    isLoading,
    cloudStatus,
  };
}