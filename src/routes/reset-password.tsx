import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, ShieldCheck } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export const Route=createFileRoute("/reset-password")({ssr:false,component:ResetPasswordPage});

function ResetPasswordPage(){
  const configured=isSupabaseConfigured();
  const [ready,setReady]=useState(false);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [isError,setIsError]=useState(false);
  const [success,setSuccess]=useState(false);
  useEffect(()=>{
    if(!configured)return;
    let active=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      if(event==="PASSWORD_RECOVERY"&&session)setReady(true);
    });
    return()=>{active=false;subscription.unsubscribe();};
  },[configured]);
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(!ready)return;
    setMessage("");
    setIsError(false);
    if(password.length<12){setIsError(true);setMessage("Use uma senha com pelo menos 12 caracteres.");return;}
    if(password!==confirm){setIsError(true);setMessage("As duas senhas precisam ser iguais.");return;}
    setLoading(true);
    const {error}=await supabase.auth.updateUser({password});
    if(error){setLoading(false);setIsError(true);setMessage("Não foi possível alterar a senha. Abra novamente o link de recuperação mais recente.");return;}
    await supabase.auth.signOut();
    setLoading(false);
    setSuccess(true);
    setMessage("Senha alterada com sucesso. Agora você pode entrar com a nova senha.");
  }
  return <main className="grid min-h-screen place-items-center bg-cream px-4 py-10"><div className="w-full max-w-md rounded-[32px] border border-nat bg-white p-6 shadow-xl sm:p-8"><Link to="/" className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-chocolate p-1" aria-label="Voltar ao início da NAT Gestão"><div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-2xl">NAT</div></Link><div className="mt-6 text-center"><p className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-[.12em] text-caramel"><Heart size={13} aria-hidden="true"/> NAT Gestão</p><h1 className="mt-2 font-display text-4xl">Criar nova senha</h1><p className="mt-2 text-base leading-6 text-caramel">A alteração só funciona quando esta página é aberta pelo link de recuperação enviado ao e-mail da conta.</p></div>{!configured?<p role="alert" className="mt-7 a11y-error">O acesso está temporariamente indisponível. Peça ajuda ao responsável técnico.</p>:!ready&&!success?<div className="mt-7 rounded-2xl bg-rose-soft p-5 text-base leading-6 text-caramel"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-chocolate" size={20} aria-hidden="true"/><p>Abra o link de recuperação recebido por e-mail. Se o link expirou ou esta página foi recarregada, solicite um novo link.</p></div><p className="mt-4 text-center"><Link to="/forgot-password" className="font-bold text-chocolate underline">Solicitar novo link</Link></p></div>:success?<div className="mt-7"><p role="status" className="rounded-xl bg-rose-soft p-4 text-base leading-6 text-chocolate">{message}</p><Link to="/login" className="primary-button mt-4 w-full justify-center">Entrar com a nova senha</Link></div>:<form className="mt-7 space-y-4" onSubmit={submit}><div><label htmlFor="new-password" className="field-label">Nova senha</label><input id="new-password" className="nat-input" type="password" value={password} onChange={(event)=>setPassword(event.target.value)} required minLength={12} autoComplete="new-password" aria-invalid={isError&&password.length<12||undefined} aria-describedby="new-password-help"/><p id="new-password-help" className="field-help">Use pelo menos 12 caracteres.</p></div><div><label htmlFor="confirm-password" className="field-label">Repita a nova senha</label><input id="confirm-password" className="nat-input" type="password" value={confirm} onChange={(event)=>setConfirm(event.target.value)} required minLength={12} autoComplete="new-password" aria-invalid={isError&&password!==confirm||undefined} aria-describedby={isError&&password!==confirm?"reset-password-message":undefined}/></div>{message&&<p id="reset-password-message" role={isError?"alert":"status"} className={isError?"a11y-error":"rounded-xl bg-rose-soft p-3 text-base text-chocolate"}>{message}</p>}<button className="primary-button w-full" disabled={loading}>{loading?"Salvando...":"Alterar senha"}</button></form>}</div></main>;
}
