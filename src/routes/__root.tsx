import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

export const Route = createRootRoute({
  headers: () => ({
    "Cache-Control": "no-store",
    "Content-Security-Policy": contentSecurityPolicy,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "NAT Gestão" },
      { name: "description", content: "Vendas, custos e precificação da NAT Brownies e Brigadeiros Gourmet." },
      { name: "theme-color", content: "#35150A" },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=GFS+Didot&family=Lato:ital,wght@0,400;0,700;0,900;1,400&display=swap" },
    ],
  }),
  shellComponent: ({ children }) => <html lang="pt-BR"><head><HeadContent /></head><body>{children}<Scripts /></body></html>,
  errorComponent: RootError,
  component: () => <Outlet />,
});

function RootError() {
  return <main className="grid min-h-screen place-items-center bg-cream px-4 text-chocolate"><div className="max-w-md rounded-3xl border border-nat bg-white p-6 text-center shadow-xl"><p className="eyebrow">NAT Gestão</p><h1 className="mt-2 font-display text-4xl">Não conseguimos abrir esta tela</h1><p className="mt-3 text-sm leading-6 text-caramel">Tente recarregar. Se o problema continuar, volte ao início e entre novamente.</p><div className="mt-6 flex justify-center gap-2"><button type="button" className="primary-button" onClick={() => window.location.reload()}>Recarregar</button><a className="secondary-button" href="/">Voltar ao início</a></div></div></main>;
}
