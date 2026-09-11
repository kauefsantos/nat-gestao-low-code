export type InventoryItemKind = "supply" | "product";
export type InventoryBaseUnit = "g" | "ml" | "unit";
export type InventoryCategory = "product" | "ingredient" | "packaging" | "other";
export type InventoryMovementType = "opening" | "purchase" | "production_in" | "production_out" | "sale" | "sale_cancel" | "adjustment";

export type InventoryItem = {
  kind: InventoryItemKind;
  itemId: string;
  name: string;
  category: InventoryCategory;
  tracked: boolean;
  currentQuantity: number;
  minimumQuantity: number;
  baseUnit: InventoryBaseUnit;
  lowStock: boolean;
  lastMovementAt: string | null;
};

export type InventoryMovement = {
  id: string;
  kind: InventoryItemKind;
  itemId: string;
  itemName: string;
  quantityDelta: number;
  baseUnit: InventoryBaseUnit;
  movementType: InventoryMovementType;
  note: string | null;
  occurredAt: string;
};

export type InventorySnapshot = { items: InventoryItem[]; movements: InventoryMovement[] };

export const emptyInventorySnapshot = (): InventorySnapshot => ({ items: [], movements: [] });
export const inventoryUnitLabel: Record<InventoryBaseUnit,string> = { g:"g",ml:"ml",unit:"un" };
export const inventoryCategoryLabel: Record<InventoryCategory,string> = {
  product:"Produto pronto",
  ingredient:"Ingrediente",
  packaging:"Embalagem",
  other:"Outro insumo",
};
export const inventoryMovementLabel: Record<InventoryMovementType,string> = {
  opening:"Saldo inicial",
  purchase:"Compra",
  production_in:"Produção",
  production_out:"Usado na produção",
  sale:"Venda",
  sale_cancel:"Venda cancelada",
  adjustment:"Ajuste de contagem",
};

export function inventoryQuantity(value:number,unit:InventoryBaseUnit) {
  const maximumFractionDigits=unit==="unit"?2:1;
  return `${new Intl.NumberFormat("pt-BR",{maximumFractionDigits}).format(value)} ${inventoryUnitLabel[unit]}`;
}
