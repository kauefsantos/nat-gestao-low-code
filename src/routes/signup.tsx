import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) throw redirect({ to: "/dashboard" });
  },
  component: SignupPage,
});

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) { setMessage("Não foi possível criar o acesso. Tente outro e-mail ou uma senha maior."); return; }
    if (data.session) window.location.href = "/dashboard";
    else setMessage("Conta criada. Confira seu e-mail para confirmar o acesso.");
  }

  return <main className="grid min-h-screen place-items-center bg-cream px-4 py-10"><div className="w-full max-w-md rounded-[32px] border border-nat bg-white p-6 shadow-xl sm:p-8"><Link to="/" className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-chocolate p-1"><div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-2xl">NAT</div></Link><div className="mt-6 text-center"><p className="eyebrow">Primeiro acesso</p><h1 className="mt-2 font-display text-4xl">Criar conta</h1><p className="mt-2 text-sm leading-6 text-caramel">Um acesso simples para manter a gestão da NAT protegida.</p></div><form className="mt-7 space-y-4" onSubmit={submit}><div><label className="field-label">E-mail</label><input className="nat-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div><div><label className="field-label">Senha</label><input className="nat-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" /><p className="field-help">Use pelo menos 6 caracteres.</p></div>{message && <p className="rounded-xl bg-rose-soft p-3 text-sm text-chocolate">{message}</p>}<button className="primary-button w-full" disabled={loading}>{loading ? "Criando..." : "Criar acesso"}</button><p className="text-center text-sm text-caramel">Já tem conta? <Link to="/login" className="font-bold text-chocolate underline">Entrar</Link></p></form></div></main>;
}