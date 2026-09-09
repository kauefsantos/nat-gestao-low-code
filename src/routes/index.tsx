import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Calculator, Heart, ReceiptText, Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="nat-paper min-h-screen bg-[#F8EEE9] text-[#35150A]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#EAAC93] bg-[#35150A]">
            <span className="font-display text-xl text-[#F2C5B5]">NAT</span>
            <Heart className="absolute -bottom-1 h-2.5 w-2.5 fill-[#EAAC93] text-[#EAAC93]" />
          </div>
          <div>
            <p className="font-display text-2xl leading-none">NAT</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.22em] text-[#956454]">Gestão do ateliê</p>
          </div>
        </div>
        <Link to="/login" search={{ redirect: "/dashboard" }} className="rounded-2xl border border-[#E7CFC5] bg-white px-4 py-2.5 text-sm font-black text-[#55281B] transition hover:bg-[#FFF9F6]">
          Entrar
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#F2C5B5]/50 px-3 py-2 text-xs font-black text-[#55281B]">
            <Sparkles className="h-4 w-4 text-[#EAAC93]" />
            Feito para a rotina da NAT
          </div>
          <h1 className="font-display text-5xl leading-[0.98] sm:text-6xl lg:text-7xl">
            Menos conta de cabeça. Mais clareza para vender.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#956454]">
            Descubra quanto custa cada brownie ou brigadeiro, quanto cobrar e quanto realmente sobrou de cada venda — de um jeito simples, visual e sem linguagem complicada.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#35150A] px-6 py-3.5 text-sm font-black text-white transition hover:bg-[#55281B]">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" search={{ redirect: "/dashboard" }} className="inline-flex min-h-13 items-center justify-center rounded-2xl border border-[#E7CFC5] bg-white px-6 py-3.5 text-sm font-black text-[#55281B]">
              Já tenho acesso
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-4 -top-5 h-24 w-24 rounded-full border border-[#EAAC93]/50" />
          <div className="absolute -bottom-8 -right-4 h-36 w-36 rounded-full border border-[#55281B]/15" />
          <div className="relative overflow-hidden rounded-[36px] bg-[#35150A] p-6 text-[#FFF9F6] shadow-[0_30px_80px_rgba(53,21,10,0.20)] sm:p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F2C5B5]">Hoje na NAT</p>
                <p className="mt-1 font-display text-3xl">Números que fazem sentido.</p>
              </div>
              <Heart className="h-5 w-5 fill-[#EAAC93] text-[#EAAC93]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DemoCard icon={<ReceiptText />} label="Vendeu" value="R$ 285,00" />
              <DemoCard icon={<TrendingUp />} label="Sobrou das vendas" value="R$ 147,20" />
              <DemoCard icon={<Calculator />} label="Custo do brownie" value="R$ 3,51" />
              <DemoCard icon={<Sparkles />} label="Preço recomendado" value="R$ 7,00" featured />
            </div>
            <div className="mt-4 rounded-2xl bg-[#55281B] p-4 text-sm leading-6 text-[#F2C5B5]">
              “A caixa tem 12 ovos e custou R$ 12. Usei meio ovo.” A NAT calcula o custo automaticamente.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature title="Cadastre o que compra" text="Ingredientes, adesivos, caixas e tudo o que entra no produto." />
          <Feature title="Monte sua receita" text="Informe quanto usa e quantas unidades a receita rende." />
          <Feature title="Venda com clareza" text="Veja custo real, preço mínimo, preço recomendado e resultado das vendas." />
        </div>
      </section>
    </main>
  );
}

function DemoCard({ icon, label, value, featured = false }: { icon: React.ReactNode; label: string; value: string; featured?: boolean }) {
  return <div className={`rounded-[22px] p-4 ${featured ? "bg-[#EAAC93] text-[#35150A]" : "bg-[#55281B] text-white"}`}><div className={`mb-4 [&>svg]:h-4 [&>svg]:w-4 ${featured ? "text-[#35150A]" : "text-[#F2C5B5]"}`}>{icon}</div><p className={`text-[10px] font-black uppercase tracking-[0.16em] ${featured ? "text-[#55281B]" : "text-[#F2C5B5]"}`}>{label}</p><p className="mt-1 font-display text-2xl">{value}</p></div>;
}
function Feature({ title, text }: { title: string; text: string }) { return <div className="rounded-[26px] border border-[#E7CFC5] bg-white/70 p-5"><p className="font-display text-2xl text-[#35150A]">{title}</p><p className="mt-2 text-sm leading-6 text-[#956454]">{text}</p></div>; }
