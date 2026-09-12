import test from "node:test";
import assert from "node:assert/strict";
import { parseRecipeCsv } from "../src/domain/recipe-csv.js";
import type { Supply } from "../src/domain/nat.js";

const chocolate: Supply = {
  id: "00000000-0000-4000-8000-000000000099",
  name: "Chocolate",
  category: "ingredient",
  packageQuantity: 1,
  packageUnit: "kg",
  packagePrice: 30,
  purchasedAt: "2026-09-11",
};

test("CSV rejeita conteúdo binário", () => {
  const result = parseRecipeCsv("Ingrediente;Quantidade;Unidade\nChocolate;100;g\0", [chocolate]);
  assert.equal(result.items.length, 0);
  assert.match(result.errors[0] ?? "", /dados binários/i);
});

test("CSV rejeita colunas extras fora do contrato", () => {
  const result = parseRecipeCsv("Ingrediente;Quantidade;Unidade;Comando\nChocolate;100;g;ignorar", [chocolate]);
  assert.equal(result.items.length, 0);
  assert.match(result.errors[0] ?? "", /somente Ingrediente;Quantidade;Unidade/i);
});

test("CSV limita quantidade de linhas", () => {
  const rows = ["Ingrediente;Quantidade;Unidade", ...Array.from({ length: 500 }, () => "Chocolate;1;g")].join("\n");
  const result = parseRecipeCsv(rows, [chocolate]);
  assert.equal(result.items.length, 0);
  assert.match(result.errors[0] ?? "", /no máximo 500 linhas/i);
});

test("CSV limita tamanho individual dos campos", () => {
  const result = parseRecipeCsv(`${"C".repeat(201)};1;g`, [chocolate]);
  assert.equal(result.items.length, 0);
  assert.match(result.errors[0] ?? "", /excede 200 caracteres/i);
});
