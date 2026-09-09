import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) { setError("Não foi possível entrar. Confira seu e-mail e senha."); return; }
    window.location.href = "/dashboard";
  }

  return <AuthLayout title="Bem-vinda de volta" text="Entre para cuidar das vendas, custos e preços da NAT."><form className="space-y-4" onSubmit={submit}><div><label className="field-label">E-mail</label><input className="nat-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div><div><label className="field-label">Senha</label><input className="nat-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" /></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button className="primary-button w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button><p className="text-center text-sm text-caramel">Ainda não tem acesso? <Link to="/signup" className="font-bold text-chocolate underline">Criar conta</Link></p></form></AuthLayout>;
}

function AuthLayout({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-cream px-4 py-10"><div className="w-full max-w-md rounded-[32px] border border-nat bg-white p-6 shadow-xl sm:p-8"><Link to="/" className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-chocolate p-1"><div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-2xl">NAT</div></Link><div className="mt-6 text-center"><p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[.18em] text-caramel"><Heart size={13} /> NAT Gestão</p><h1 className="mt-2 font-display text-4xl">{title}</h1><p className="mt-2 text-sm leading-6 text-caramel">{text}</p></div><div className="mt-7">{children}</div></div></main>;
}