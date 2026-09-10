import { id, preferredUsageUnit, type RecipeItem, type Supply, type Unit } from "./nat.js";

export type RecipeCsvResult = { items: RecipeItem[]; errors: string[] };

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function delimiterFor(line: string) {
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}
function splitLine(line: string, delimiter: string) {
  const result: string[] = []; let current = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { result.push(current.trim()); current = ""; }
    else current += char;
  }
  result.push(current.trim());
  return result;
}
function parseUnit(raw: string, fallback: Unit): Unit | null {
  const value = normalize(raw);
  if (!value) return fallback;
  if (["g","grama","gramas"].includes(value)) return "g";
  if (["kg","quilo","quilos","kilograma","kilogramas"].includes(value)) return "kg";
  if (["ml","mililitro","mililitros"].includes(value)) return "ml";
  if (["l","litro","litros"].includes(value)) return "l";
  if (["un","und","unidade","unidades","unit"].includes(value)) return "unit";
  return null;
}
function quantityValue(raw: string, delimiter: string) {
  const normalized = delimiter === "," ? raw.trim() : raw.trim().replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function parseRecipeCsv(text: string, supplies: Supply[]): RecipeCsvResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { items: [], errors: ["Cole ou envie um CSV com pelo menos uma linha."] };
  const delimiter = delimiterFor(lines[0]);
  const first = splitLine(lines[0], delimiter).map(normalize);
  const hasHeader = first.some((cell) => ["ingrediente","insumo","item","produto"].includes(cell)) && first.some((cell) => ["quantidade","qtd"].includes(cell));
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const supplyByName = new Map(supplies.map((supply) => [normalize(supply.name), supply]));
  const merged = new Map<string, RecipeItem>();
  const errors: string[] = [];

  dataLines.forEach((line, offset) => {
    const lineNumber = offset + (hasHeader ? 2 : 1);
    const cells = splitLine(line, delimiter);
    if (cells.length < 2) { errors.push(`Linha ${lineNumber}: use Ingrediente;Quantidade;Unidade.`); return; }
    const supply = supplyByName.get(normalize(cells[0]));
    if (!supply) { errors.push(`Linha ${lineNumber}: “${cells[0]}” não está cadastrado em Ingredientes e embalagens.`); return; }
    const quantity = quantityValue(cells[1], delimiter);
    if (!Number.isFinite(quantity) || quantity <= 0) { errors.push(`Linha ${lineNumber}: quantidade precisa ser maior que zero.`); return; }
    const unit = parseUnit(cells[2] ?? "", preferredUsageUnit(supply.packageUnit));
    if (!unit) { errors.push(`Linha ${lineNumber}: unidade “${cells[2]}” não é reconhecida.`); return; }
    const allowed: Unit[] = supply.packageUnit === "kg" || supply.packageUnit === "g" ? ["g","kg"] : supply.packageUnit === "l" || supply.packageUnit === "ml" ? ["ml","l"] : ["unit"];
    if (!allowed.includes(unit)) { errors.push(`Linha ${lineNumber}: unidade incompatível com ${supply.name}.`); return; }
    const key = `${supply.id}:${unit}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key,{ id: id("recipe"), supplyId: supply.id, quantity, unit });
  });

  return { items: [...merged.values()], errors };
}
