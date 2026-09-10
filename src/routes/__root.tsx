import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth, type AuthState } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import appCss from "../styles.css?url";

const queryClient = new QueryClient();
interface RouterContext { auth: AuthState }
const contentSecurityPolicy = ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "img-src 'self' data: blob:", "font-src 'self' https://fonts.gstatic.com data:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "script-src 'self' 'unsafe-inline'", "connect-src 'self' https://*.supabase.co wss://*.supabase.co"].join("; ");

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => { const { data: { session } } = await supabase.auth.getSession(); return { auth: { isAuthenticated: Boolean(session), user: session?.user ?? null, session, isLoading: false } as AuthState }; },
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
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }, { title: "NAT Gestão" }, { name: "description", content: "Vendas, custos e precificação da NAT Brownies e Brigadeiros Gourmet." }, { name: "theme-color", content: "#35150A" }],
    links: [{ rel: "stylesheet", href: appCss }, { rel: "preconnect", href: "https://fonts.googleapis.com" }, { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" }, { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=GFS+Didot&family=Lato:ital,wght@0,400;0,700;0,900;1,400&display=swap" }],
  }),
  shellComponent: ({ children }) => <html lang="pt-BR"><head><HeadContent /></head><body>{children}<Scripts /></body></html>,
  component: Root,
});
function Root() { const router = useRouter(); const auth = useAuth(); useEffect(() => { void router.invalidate(); }, [auth.isAuthenticated, router]); return <QueryClientProvider client={queryClient}><Outlet /></QueryClientProvider>; }
