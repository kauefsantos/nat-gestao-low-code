import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/lovable-cloud/database";
import type { PaymentMethod, TransactionType } from "@/domain/nat";

export type SaleQuote = {
  listTotal: number;
  totalCost: number;
  totalQuantity: number;
  variableFee: number;
  deliveryCost: number;
  contribution: number;
  marginPercent: number;
  belowCost: boolean;
};

function quoteFrom(value: unknown): SaleQuote {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    listTotal: Number(row.listTotal ?? 0),
    totalCost: Number(row.totalCost ?? 0),
    totalQuantity: Number(row.totalQuantity ?? 0),
    variableFee: Number(row.variableFee ?? 0),
    deliveryCost: Number(row.deliveryCost ?? 0),
    contribution: Number(row.contribution ?? 0),
    marginPercent: Number(row.marginPercent ?? 0),
    belowCost: row.belowCost === true,
  };
}

export async function quoteSale(args: {
  businessId: string;
  items: Array<{ productId: string; quantity: number }>;
  totalReceived: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  transactionType: TransactionType;
  deliveryCost: number;
}): Promise<SaleQuote> {
  const result = await supabase.rpc("quote_sale_v1", {
    p_business_id: args.businessId,
    p_items: args.items as unknown as Json,
    p_total_received: args.totalReceived,
    p_payment_method: args.paymentMethod,
    p_sold_at: args.soldAt,
    p_transaction_type: args.transactionType,
    p_delivery_cost: args.deliveryCost,
  });
  if (result.error) throw new Error("Não foi possível calcular o custo desta venda. Confira os dados e tente novamente.");
  return quoteFrom(result.data);
}
