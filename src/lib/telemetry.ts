type DiagnosticEvent = {
  at: string;
  kind: "error" | "rejection" | "manual";
  message: string;
  path: string;
  stack?: string;
};

const STORAGE_KEY = "nat:diagnostics:v1";
const LIMIT = 30;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

const REDACTIONS: Array<[RegExp,string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email removido]"],
  [/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g,"[telefone removido]"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g,"[cpf removido]"],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g,"[cnpj removido]"],
  [/(bearer\s+)[a-z0-9._-]+/gi,"$1[token removido]"],
  [/(api[_-]?key|secret|token|authorization)(\s*[:=]\s*)[^\s,;]+/gi,"$1$2[segredo removido]"],
];

export function redactDiagnosticText(value: string) {
  return REDACTIONS.reduce((text,[pattern,replacement])=>text.replace(pattern,replacement),value);
}

function safeText(value: unknown) {
  if (value instanceof Error) return redactDiagnosticText(value.message);
  if (typeof value === "string") return redactDiagnosticText(value);
  try { return redactDiagnosticText(JSON.stringify(value)); } catch { return "Erro sem detalhes serializáveis"; }
}

export function pruneDiagnostics(events: DiagnosticEvent[], now = Date.now()) {
  return events.filter((event)=>{
    const at = new Date(event.at).getTime();
    return Number.isFinite(at) && now - at <= TTL_MS;
  }).slice(-LIMIT);
}

export function readDiagnostics(): DiagnosticEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    const cleaned = Array.isArray(parsed) ? pruneDiagnostics(parsed) : [];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
}

function writeEvent(event: DiagnosticEvent) {
  if (typeof window === "undefined") return;
  try {
    const next = pruneDiagnostics([...readDiagnostics(), {
      ...event,
      message:redactDiagnosticText(event.message),
      stack:event.stack?redactDiagnosticText(event.stack):undefined,
    }]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Observabilidade nunca deve quebrar o fluxo principal.
  }
}

export function clearDiagnostics() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function recordDiagnostic(message: string, stack?: string) {
  writeEvent({ at: new Date().toISOString(), kind: "manual", message: redactDiagnosticText(message).slice(0, 500), path: window.location.pathname, stack: stack?redactDiagnosticText(stack).slice(0, 2_000):undefined });
}

export function installGlobalDiagnostics() {
  if (typeof window === "undefined") return () => undefined;
  const onError = (event: ErrorEvent) => writeEvent({
    at: new Date().toISOString(),
    kind: "error",
    message: safeText(event.error ?? event.message).slice(0, 500),
    path: window.location.pathname,
    stack: event.error instanceof Error ? redactDiagnosticText(event.error.stack ?? "").slice(0, 2_000) : undefined,
  });
  const onRejection = (event: PromiseRejectionEvent) => writeEvent({
    at: new Date().toISOString(),
    kind: "rejection",
    message: safeText(event.reason).slice(0, 500),
    path: window.location.pathname,
    stack: event.reason instanceof Error ? redactDiagnosticText(event.reason.stack ?? "").slice(0, 2_000) : undefined,
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
    retention: "14 days",
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    events: readDiagnostics(),
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