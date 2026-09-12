import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Heart, ReceiptText, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-cream text-chocolate">
      <section className="mx-auto grid min-h-[86vh] max-w-6xl min-w-0 items-center gap-12 px-5 py-16 sm:px-8 md:grid-cols-2">
        <div className="min-w-0">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-rose-soft px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-caramel"><Heart className="shrink-0" size={14} /> Feito para a rotina real da NAT</div>
          <h1 className="mt-7 max-w-full font-display text-6xl leading-[.95] sm:text-7xl">O doce é artesanal.<br />A gestão pode ser simples.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-caramel">Descubra quanto custa cada produto, por quanto vender e quanto realmente sobrou — sem planilha e sem conta de cabeça.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link to="/login" className="primary-button">Entrar no NAT Gestão</Link><Link to="/signup" className="secondary-button">Criar acesso</Link></div>
        </div>
        <div className="relative min-w-0"><div aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-full bg-rose/20 blur-3xl" /><div className="relative min-w-0 rounded-[36px] border border-nat bg-white p-6 shadow-xl sm:p-8"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full border-2 border-chocolate p-2"><div className="grid h-full w-full place-items-center rounded-full border border-chocolate font-display text-3xl">NAT</div></div><p className="mt-5 text-center font-display text-3xl">Doces momentos em cada mordida</p><div className="mt-8 grid min-w-0 gap-3"><Feature icon={<ReceiptText size={19} />} title="Vendas" text="Registre em segundos." /><Feature icon={<Calculator size={19} />} title="Precificação" text="Custo e preço saudável automaticamente." /><Feature icon={<Sparkles size={19} />} title="Sem complicação" text="Linguagem simples e visual feito para celular." /></div></div></div>
      </section>
      <footer className="border-t border-nat px-5 py-6 text-center text-xs font-bold uppercase tracking-[.2em] text-caramel">NAT • Brownies e Brigadeiros Gourmet</footer>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-soft p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-soft">{icon}</div><div className="min-w-0"><p className="font-bold">{title}</p><p className="text-sm text-caramel">{text}</p></div></div>;
}
