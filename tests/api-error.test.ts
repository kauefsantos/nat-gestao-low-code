import assert from "node:assert/strict";
import test from "node:test";
import { classifyApiError } from "../src/lib/api-error.js";

test("classifies version conflicts",()=>{
  assert.equal(classifyApiError(new Error("CONFLICT: product foi alterado em outro aparelho.")).code,"VERSION_CONFLICT");
});

test("classifies idempotency conflicts",()=>{
  assert.equal(classifyApiError(new Error("CONFLICT: identificador de operação reutilizado com conteúdo diferente.")).code,"IDEMPOTENCY_CONFLICT");
});

test("classifies validation errors",()=>{
  assert.equal(classifyApiError(new Error("Estoque insuficiente para concluir a venda.")).code,"VALIDATION_ERROR");
});

test("classifies network errors as retryable",()=>{
  assert.equal(classifyApiError(new Error("Failed to fetch")).retryable,true);
});
