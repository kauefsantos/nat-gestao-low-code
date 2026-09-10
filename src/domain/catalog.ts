import { monthSales, productCost, type NatState, type Product, type Sale, type SupplyCategory, type Unit } from "./nat.js";

export type ProductFamily = "brownie" | "brigadeiro";
export type CatalogItem = { key: string; family: ProductFamily; flavor: string; name: string };
export type StarterSupply = { name: string; category: SupplyCategory; suggestedUnit: Unit };
export type RecipeReferenceItem = { name: string; amount: string; estimate?: string };
export type RecipeReference = { title: string; note: string; items: RecipeReferenceItem[] };

export const BROWNIE_CATALOG: CatalogItem[] = [
  { key: "brownie-tradicional", family: "brownie", flavor: "Tradicional", name: "Brownie • Tradicional" },
  { key: "brownie-ninho-nutella", family: "brownie", flavor: "Ninho com Nutella", name: "Brownie • Ninho com Nutella" },
  { key: "brownie-ninho", family: "brownie", flavor: "Ninho", name: "Brownie • Ninho" },
  { key: "brownie-beijinho", family: "brownie", flavor: "Beijinho", name: "Brownie • Beijinho" },
  { key: "brownie-maracuja", family: "brownie", flavor: "Brigadeiro de maracujá", name: "Brownie • Brigadeiro de maracujá" },
  { key: "brownie-brigadeiro", family: "brownie", flavor: "Brigadeiro tradicional", name: "Brownie • Brigadeiro tradicional" },
];

export const BRIGADEIRO_CATALOG: CatalogItem[] = [
  { key: "brigadeiro-ninho-nutella", family: "brigadeiro", flavor: "Ninho com Nutella", name: "Brigadeiro • Ninho com Nutella" },
  { key: "brigadeiro-tradicional", family: "brigadeiro", flavor: "Tradicional", name: "Brigadeiro • Tradicional" },
  { key: "brigadeiro-uva", family: "brigadeiro", flavor: "Surpresa de uva", name: "Brigadeiro • Surpresa de uva" },
  { key: "brigadeiro-ninho", family: "brigadeiro", flavor: "Ninho", name: "Brigadeiro • Ninho" },
  { key: "brigadeiro-beijinho", family: "brigadeiro", flavor: "Beijinho", name: "Brigadeiro • Beijinho" },
  { key: "brigadeiro-dois-amores", family: "brigadeiro", flavor: "2 Amores", name: "Brigadeiro • 2 Amores" },
  { key: "brigadeiro-ferrero", family: "brigadeiro", flavor: "Ferrero", name: "Brigadeiro • Ferrero" },
];

export const PRODUCT_CATALOG = [...BROWNIE_CATALOG, ...BRIGADEIRO_CATALOG];

export const BROWNIE_BASE_RECIPE: RecipeReference = {
  title: "Brownie sem recheio — receita-base",
  note: "Para a primeira estimativa, consideramos uma xícara de café de 50 ml. Farinha, açúcar e chocolate em pó devem ser pesados em uma próxima produção para substituir estas estimativas pela medida real da cozinha da NAT.",
  items: [
    { name: "Farinha de trigo", amount: "1 xícara de café", estimate: "≈ 25 g (estimativa para 50 ml)" },
    { name: "Açúcar", amount: "1½ xícara de café", estimate: "≈ 64 g (estimativa para 75 ml)" },
    { name: "Chocolate em pó", amount: "6 colheres de sopa", estimate: "≈ 36 g (estimativa inicial)" },
    { name: "Manteiga", amount: "100 g" },
    { name: "Ovos", amount: "3 unidades" },
    { name: "Nutella", amount: "80 g" },
  ],
};

export const BRIGADEIRO_BASE_RECIPE: RecipeReference = {
  title: "Brigadeiro — receita-base",
  note: "A caixa de leite condensado foi considerada como 395 g e meia caixa de creme de leite como aproximadamente 100 g, assumindo uma caixa de 200 g. Ajuste quando registrar a embalagem realmente comprada.",
  items: [
    { name: "Leite condensado", amount: "1 caixa", estimate: "≈ 395 g se a caixa for de 395 g" },
    { name: "Creme de leite", amount: "½ caixa", estimate: "≈ 100 g se a caixa for de 200 g" },
    { name: "Base do sabor", amount: "150 g", estimate: "Chocolate em pó 50% OU Leite Ninho OU coco ralado, conforme o sabor" },
  ],
};

export const STARTER_INGREDIENTS: StarterSupply[] = [
  { name: "Farinha de trigo", category: "ingredient", suggestedUnit: "g" },
  { name: "Açúcar", category: "ingredient", suggestedUnit: "g" },
  { name: "Chocolate em pó 50%", category: "ingredient", suggestedUnit: "g" },
  { name: "Manteiga", category: "ingredient", suggestedUnit: "g" },
  { name: "Ovos", category: "ingredient", suggestedUnit: "unit" },
  { name: "Nutella", category: "ingredient", suggestedUnit: "g" },
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
export function portfolioKeyForSale(sale: Sale, state: NatState) {
  if (sale.portfolioKey) return sale.portfolioKey;
  const product = state.products.find((candidate) => candidate.id === sale.productId);
  return product ? catalogItemForProduct(product)?.key ?? null : PRODUCT_CATALOG.find((item) => normalize(item.name) === normalize(sale.productName))?.key ?? null;
}
export function roundUpToHalf(value: number) { return Number.isFinite(value) ? Math.ceil(value * 2 - 1e-9) / 2 : Number.NaN; }

export function familyPricingSummary(state: NatState, family: ProductFamily) {
  const items = PRODUCT_CATALOG.filter((item) => item.family === family);
  const configured = items.map((item) => {
    const product = state.products.find((candidate) => candidate.portfolioKey === item.key) ?? state.products.find((candidate) => catalogItemForProduct(candidate)?.key === item.key);
    if (!product) return { item, product: null, metrics: null };
    const metrics = productCost(product, state.supplies, state.settings.paymentFeePercent);
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
  const month = monthSales(state.sales);
  const aggregate = (sales: Sale[]) => {
    const map = new Map<string, { key: string; quantity: number; revenue: number; contribution: number }>();
    for (const sale of sales) {
      const key = portfolioKeyForSale(sale, state);
      if (!key) continue;
      const current = map.get(key) ?? { key, quantity: 0, revenue: 0, contribution: 0 };
      current.quantity += sale.quantity;
      current.revenue += sale.totalReceived;
      current.contribution += sale.contributionSnapshot;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
  };
  return { month: aggregate(month), allTime: aggregate(state.sales) };
}
