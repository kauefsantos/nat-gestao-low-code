import { id } from "./format.js";
import { productCost } from "./pricing.js";
import type { PaymentMethod, Product, Sale, SaleChannel, SaleLine, Supply, TransactionType } from "./types.js";

export function buildSaleOrder(args: {
  items: Array<{ product: Product; quantity: number }>;
  supplies: Supply[];
  paymentFeePercent: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  customerId?: string | null;
  transactionType?: TransactionType;
  saleChannel?: SaleChannel;
  deliveryCost?: number;
  discountReason?: string | null;
  belowCostOverride?: boolean;
}): Sale {
  if (!args.items.length) throw new Error("Adicione pelo menos um produto.");

  const transactionType = args.transactionType ?? "sale";
  const received = transactionType === "sale" ? args.totalReceived : 0;
  const seen = new Set<string>();
  let totalCost = 0;
  let totalQuantity = 0;
  let listTotal = 0;

  const prepared = args.items.map(({ product, quantity }) => {
    if (transactionType === "sale" && product.available === false) throw new Error(`${product.name} está pausado e não pode entrar em uma nova venda.`);
    if (seen.has(product.id)) throw new Error("O mesmo produto não pode aparecer duas vezes.");
    seen.add(product.id);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) throw new Error("A quantidade precisa ser um número inteiro maior que zero.");

    const metrics = productCost(product, args.supplies, args.paymentFeePercent);
    if (!metrics.recipeValid || !Number.isFinite(metrics.unitCost)) throw new Error("Não foi possível calcular o custo desta movimentação.");

    totalCost += metrics.unitCost * quantity;
    totalQuantity += quantity;
    listTotal += product.sellingPrice * quantity;
    return {
      product,
      quantity,
      unitCost: metrics.unitCost,
      unitLabor: product.batchYield > 0 ? (product.laborCostPerBatch ?? 0) / product.batchYield : 0,
      listValue: product.sellingPrice * quantity,
    };
  });

  const deliveryCost = transactionType === "sale" ? Math.max(0, args.deliveryCost ?? 0) : 0;
  const variableFeeSnapshot = transactionType === "sale" ? received * Math.max(0, args.paymentFeePercent) / 100 : 0;
  const contributionSnapshot = received - totalCost - variableFeeSnapshot - deliveryCost;
  const discountReason = (args.discountReason ?? "").trim() || null;

  if (transactionType === "sale" && received + 0.005 < listTotal && !discountReason) throw new Error("Informe o motivo do desconto.");
  if (transactionType === "sale" && contributionSnapshot < 0 && !args.belowCostOverride) throw new Error("Esta venda fica abaixo do custo. Confirme conscientemente para continuar.");
  if (transactionType === "sale" && contributionSnapshot < 0 && args.belowCostOverride && !discountReason) throw new Error("Informe o motivo para confirmar uma venda abaixo do custo.");

  const items: SaleLine[] = prepared.map(({ product, quantity, unitCost, unitLabor, listValue }) => {
    const lineRevenue = transactionType === "sale"
      ? (listTotal > 0 ? received * listValue / listTotal : received * quantity / totalQuantity)
      : 0;
    return {
      productId: product.id,
      productName: product.name,
      portfolioKey: product.portfolioKey ?? null,
      quantity,
      unitCostSnapshot: unitCost,
      laborCostSnapshot: unitLabor,
      unitPriceSnapshot: lineRevenue / quantity,
    };
  });

  const first = items[0];
  return {
    id: id("sale"),
    productId: first.productId,
    productName: items.length === 1 ? first.productName : `${items.length} produtos`,
    portfolioKey: items.length === 1 ? first.portfolioKey ?? null : null,
    customerId: args.customerId ?? null,
    transactionType,
    saleChannel: transactionType === "sale" ? (args.saleChannel ?? "other") : "other",
    deliveryCostSnapshot: deliveryCost,
    discountReason,
    belowCostOverride: transactionType === "sale" ? Boolean(args.belowCostOverride) : false,
    quantity: totalQuantity,
    totalReceived: received,
    paymentMethod: args.paymentMethod,
    soldAt: args.soldAt,
    unitCostSnapshot: totalQuantity > 0 ? totalCost / totalQuantity : 0,
    variableFeeSnapshot,
    contributionSnapshot,
    items,
    status: "completed",
    cancelledAt: null,
    cancelReason: null,
  };
}

export function buildSale(args: {
  product: Product;
  supplies: Supply[];
  paymentFeePercent: number;
  quantity: number;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
}): Sale {
  return buildSaleOrder({
    items: [{ product: args.product, quantity: args.quantity }],
    supplies: args.supplies,
    paymentFeePercent: args.paymentFeePercent,
    totalReceived: args.totalReceived,
    paymentMethod: args.paymentMethod,
    soldAt: args.soldAt,
  });
}
