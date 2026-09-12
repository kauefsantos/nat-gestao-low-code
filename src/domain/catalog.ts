import { activeSaleLines, monthSales, pricingFeePercent, productCost, type NatState, type Product, type Sale, type SaleLine, type SupplyCategory, type Unit } from "./nat.js";

export type ProductFamily = "brownie" | "brigadeiro";
export type CatalogItem = { key: string; family: ProductFamily; flavor: string; name: string };
export type StarterSupply = { name: string; category: SupplyCategory; suggestedUnit: Unit };
type RecipeReferenceItem = { name: string; amount: string; estimate?: string };
type RecipeReference = { title: string; note: string; items: RecipeReferenceItem[] };

export const BROWNIE_CATALOG: CatalogItem[] = [
  { key: "brownie-tradicional", family: "brownie", flavor: "Tradicional", name: "Brownie • Tradicional" },
  { key: "brownie-doce-de-leite", family: "brownie", flavor: "Doce de leite", name: "Brownie • Doce de Leite" },
  { key: "brownie-ninho-nutella", family: "brownie", flavor: "Ninho com Nutella", name: "Brownie • Ninho com Nutella" },
  { key: "brownie-ninho", family: "brownie", flavor: "Ninho", name: "Brownie • Ninho" },
  { key: "brownie-beijinho", family: "brownie", flavor: "Beijinho", name: "Brownie • Beijinho" },
  { key: "brownie-maracuja", family: "brownie", flavor: "Brigadeiro de maracujá", name: "Brownie • Brigadeiro de maracujá" },
  { key: "brownie-brigadeiro", family: "brownie", flavor: "Brigadeiro tradicional", name: "Brownie • Brigadeiro tradicional" },
];

export const BRIGADEIRO_CATALOG: CatalogItem[] = [
  { key: "brigadeiro-ninho-nutella", family: "brigadeiro", flavor: "Ninho com Nutella", name: "Brigadeiro • Ninho com Nutella" },
  { key: "brigadeiro-tradicional", family: "brigadeiro", flavor: "Tradicional", name: "Brigadeiro • Tradicional" },
  { key: "brigadeiro-oreo", family: "brigadeiro", flavor: "Oreo", name: "Brigadeiro • Oreo" },
  { key: "surpresa-uva", family: "brigadeiro", flavor: "Surpresa de Uva", name: "Surpresa de Uva" },
  { key: "brigadeiro-ninho", family: "brigadeiro", flavor: "Ninho", name: "Brigadeiro • Ninho" },
  { key: "brigadeiro-beijinho", family: "brigadeiro", flavor: "Beijinho", name: "Brigadeiro • Beijinho" },
  { key: "brigadeiro-dois-amores", family: "brigadeiro", flavor: "2 Amores", name: "Brigadeiro • 2 Amores" },
  { key: "brigadeiro-ferrero", family: "brigadeiro", flavor: "Ferrero", name: "Brigadeiro • Ferrero" },
];

export const PRODUCT_CATALOG = [...BROWNIE_CATALOG, ...BRIGADEIRO_CATALOG];

const BROWNIE_BASE_RECIPE: RecipeReference = {
  title: "Exemplo demonstrativo — brownie",
  note: "Dados fictícios usados apenas para demonstrar o fluxo de cadastro e precificação. Não representam a receita operacional da NAT.",
  items: [
    { name: "Ingrediente A", amount: "120 g", estimate: "valor fictício" },
    { name: "Ingrediente B", amount: "75 g", estimate: "valor fictício" },
    { name: "Ingrediente C", amount: "40 g", estimate: "valor fictício" },
    { name: "Ingrediente D", amount: "2 unidades", estimate: "valor fictício" },
  ],
};

const BRIGADEIRO_BASE_RECIPE: RecipeReference = {
  title: "Exemplo demonstrativo — doce de enrolar",
  note: "Dados fictícios usados apenas para demonstrar o fluxo de cadastro e precificação. Não representam a receita operacional da NAT.",
  items: [
    { name: "Ingrediente A", amount: "300 g", estimate: "valor fictício" },
    { name: "Ingrediente B", amount: "90 g", estimate: "valor fictício" },
    { name: "Ingrediente C", amount: "110 g", estimate: "valor fictício" },
  ],
};

export const STARTER_INGREDIENTS: StarterSupply[] = [
  { name: "Farinha de trigo", category: "ingredient", suggestedUnit: "g" },
  { name: "Açúcar", category: "ingredient", suggestedUnit: "g" },
  { name: "Chocolate em pó 50%", category: "ingredient", suggestedUnit: "g" },
  { name: "Manteiga", category: "ingredient", suggestedUnit: "g" },
  { name: "Ovos", category: "ingredient", suggestedUnit: "unit" },
  { name: "Nutella", category: "ingredient", suggestedUnit: "g" },
  { name: "Doce de leite", category: "ingredient", suggestedUnit: "g" },
  { name: "Leite condensado", category: "ingredient", suggestedUnit: "g" },
  { name: "Creme de leite", category: "ingredient", suggestedUnit: "g" },
  { name: "Leite Ninho", category: "ingredient", suggestedUnit: "g" },
  { name: "Coco ralado", category: "ingredient", suggestedUnit: "g" },
  { name: "Uva", category: "ingredient", suggestedUnit: "g" },
  { name: "Maracujá", category: "ingredient", suggestedUnit: "g" },
];

export const STARTER_PACKAGING: StarterSupply[] = [
  { name: "Embalagem de papelão", category: "packaging", suggestedUnit: "unit" },
  { name: "Forma para brigadeiro", category: "packaging", suggestedUnit: "unit" },
  { name: "Embalagem para brigadeiro", category: "packaging", suggestedUnit: "unit" },
  { name: "Saquinho para brownie", category: "packaging", suggestedUnit: "unit" },
  { name: "Adesivo de violação", category: "packaging", suggestedUnit: "unit" },
];

export const STARTER_SPORADIC_EXPENSES = [
  "Forma para airfryer",
  "Saco de confeitar",
  "Bico de confeitar",
  "Cortador de brownie",
];

const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
export const catalogItemByKey = (key: string | null | undefined) => PRODUCT_CATALOG.find((item) => item.key === key) ?? null;
export function catalogItemForProduct(product: Product) {
  const explicit = catalogItemByKey(product.portfolioKey);
  if (explicit) return explicit;
  const normalizedName = normalize(product.name);
  return PRODUCT_CATALOG.find((item) => normalize(item.name) === normalizedName) ?? null;
}
export function recipeReferenceForFamily(family: ProductFamily) { return family === "brownie" ? BROWNIE_BASE_RECIPE : BRIGADEIRO_BASE_RECIPE; }
function portfolioKeyForLine(line: SaleLine, state: NatState) {
  if (line.portfolioKey) return line.portfolioKey;
  const product=state.products.find((candidate)=>candidate.id===line.productId);
  return product ? catalogItemForProduct(product)?.key ?? null : PRODUCT_CATALOG.find((item)=>normalize(item.name)===normalize(line.productName))?.key ?? null;
}
export function roundUpToHalf(value: number) { return Number.isFinite(value) ? Math.ceil(value * 2 - 1e-9) / 2 : Number.NaN; }

export function familyPricingSummary(state: NatState, family: ProductFamily) {
  const items = PRODUCT_CATALOG.filter((item) => item.family === family);
  const fee=pricingFeePercent(state.settings);
  const configured = items.map((item) => {
    const product = state.products.find((candidate) => candidate.portfolioKey === item.key) ?? state.products.find((candidate) => catalogItemForProduct(candidate)?.key === item.key);
    if (!product) return { item, product: null, metrics: null };
    const metrics = productCost(product, state.supplies, fee);
    const ready = product.recipe.length > 0 && metrics.recipeValid && metrics.pricingValid && Number.isFinite(metrics.unitCost) && metrics.unitCost > 0;
    return { item, product, metrics: ready ? metrics : null };
  });
  const ready = configured.filter((entry) => entry.metrics);
  const recommended = ready.map((entry) => entry.metrics?.recommendedPrice ?? Number.NaN).filter(Number.isFinite);
  const minimum = ready.map((entry) => entry.metrics?.minimumPrice ?? Number.NaN).filter(Number.isFinite);
  return {
    entries: configured,
    readyCount: ready.length,
    totalCount: items.length,
    commonRecommendedPrice: recommended.length ? roundUpToHalf(Math.max(...recommended)) : Number.NaN,
    commonMinimumPrice: minimum.length ? roundUpToHalf(Math.max(...minimum)) : Number.NaN,
  };
}

export function portfolioAnalytics(state: NatState) {
  const commercial=(sales:Sale[])=>sales.filter((sale)=>sale.status!=="cancelled"&&(sale.transactionType??"sale")==="sale");
  const month = commercial(monthSales(state.sales));
  const aggregate = (sales: Sale[]) => {
    const map = new Map<string, { key: string; quantity: number; revenue: number; contribution: number }>();
    for (const sale of commercial(sales)) {
      const lines=activeSaleLines(sale);
      const lineRevenueTotal=lines.reduce((sum,line)=>sum+line.unitPriceSnapshot*line.quantity,0);
      const orderContribution=sale.contributionSnapshot;
      for (const line of lines) {
        const key=portfolioKeyForLine(line,state);
        if(!key) continue;
        const revenue=line.unitPriceSnapshot*line.quantity;
        const lineCost=line.unitCostSnapshot*line.quantity;
        const directContribution=revenue-lineCost;
        const contribution=lineRevenueTotal>0 ? orderContribution*(revenue/lineRevenueTotal) : directContribution;
        const current=map.get(key)??{key,quantity:0,revenue:0,contribution:0};
        current.quantity+=line.quantity;
        current.revenue+=revenue;
        current.contribution+=contribution;
        map.set(key,current);
      }
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  };
  return { month: aggregate(month), allTime: aggregate(state.sales) };
}
