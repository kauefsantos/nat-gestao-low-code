type DiagnosticEvent = {
  at: string;
  kind: "error" | "rejection" | "manual";
  message: string;
  path: string;
  stack?: string;
};

const STORAGE_KEY = "nat:diagnostics:v1";
const LIMIT = 30;

function safeText(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return "Erro sem detalhes serializáveis"; }
}

function readEvents(): DiagnosticEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(-LIMIT) : [];
  } catch {
    return [];
  }
}

function writeEvent(event: DiagnosticEvent) {
  if (typeof window === "undefined") return;
  try {
    const next = [...readEvents(), event].slice(-LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Observabilidade nunca deve quebrar o fluxo principal.
  }
}

export function recordDiagnostic(message: string, stack?: string) {
  writeEvent({ at: new Date().toISOString(), kind: "manual", message: message.slice(0, 500), path: window.location.pathname, stack: stack?.slice(0, 2_000) });
}

export function installGlobalDiagnostics() {
  if (typeof window === "undefined") return () => undefined;
  const onError = (event: ErrorEvent) => writeEvent({
    at: new Date().toISOString(),
    kind: "error",
    message: safeText(event.error ?? event.message).slice(0, 500),
    path: window.location.pathname,
    stack: event.error instanceof Error ? event.error.stack?.slice(0, 2_000) : undefined,
  });
  const onRejection = (event: PromiseRejectionEvent) => writeEvent({
    at: new Date().toISOString(),
    kind: "rejection",
    message: safeText(event.reason).slice(0, 500),
    path: window.location.pathname,
    stack: event.reason instanceof Error ? event.reason.stack?.slice(0, 2_000) : undefined,
  });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

export function downloadDiagnostics() {
  const content = JSON.stringify({
    generatedAt: new Date().toISOString(),
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    events: readEvents(),
  }, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nat-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
