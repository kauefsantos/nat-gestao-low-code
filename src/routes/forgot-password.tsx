import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export const Route=createFileRoute("/forgot-password")({ssr:false,component:ForgotPasswordPage});

function ForgotPasswordPage(){
  const configured=isSupabaseConfigured();
  const [email,setEmail]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(!configured)return;
    setLoading(true);
    setMessage("");
    const redirectTo=`${window.location.origin}/reset-password`;
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo});
    setLoading(false);
    setMessage("Se este e-mail estiver cadastrado, enviaremos um link para criar uma nova senha. Confira também a pasta de spam.");
  }
  return <main className="grid min-h-screen place-items-center bg-cream px-4 py-10"><div className="w-full max-w-md rounded-[32px] border border-nat bg-white p-6 shadow-xl sm:p-8"><Link to="/" className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-chocolate p-1"><div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-2xl">NAT</div></Link><div className="mt-6 text-center"><p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[.18em] text-caramel"><Heart size={13}/> NAT Gestão</p><h1 className="mt-2 font-display text-4xl">Recuperar senha</h1><p className="mt-2 text-sm leading-6 text-caramel">Informe o e-mail da conta. A troca de senha só será liberada pelo link enviado para esse endereço.</p></div>{!configured?<p role="alert" className="mt-7 rounded-xl bg-red-50 p-3 text-sm text-red-700">O ambiente ainda não está configurado.</p>:<form className="mt-7 space-y-4" onSubmit={submit}><div><label htmlFor="recovery-email" className="field-label">E-mail</label><input id="recovery-email" className="nat-input" type="email" value={email} onChange={(event)=>setEmail(event.target.value)} required autoComplete="email"/></div>{message&&<p role="status" className="rounded-xl bg-rose-soft p-3 text-sm text-chocolate">{message}</p>}<button className="primary-button w-full" disabled={loading}>{loading?"Enviando...":"Enviar link de recuperação"}</button><p className="text-center text-sm text-caramel"><Link to="/login" className="font-bold text-chocolate underline">Voltar para o login</Link></p></form>}</div></main>;
}
