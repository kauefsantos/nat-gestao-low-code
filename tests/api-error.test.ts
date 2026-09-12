import { describe,expect,it } from "vitest";
import { classifyApiError } from "@/lib/api-error";

describe("API error classification",()=>{
  it("classifies version conflicts",()=>expect(classifyApiError(new Error("CONFLICT: product foi alterado em outro aparelho.")).code).toBe("VERSION_CONFLICT"));
  it("classifies idempotency conflicts",()=>expect(classifyApiError(new Error("CONFLICT: identificador de operação reutilizado com conteúdo diferente.")).code).toBe("IDEMPOTENCY_CONFLICT"));
  it("classifies validation errors",()=>expect(classifyApiError(new Error("Estoque insuficiente para concluir a venda.")).code).toBe("VALIDATION_ERROR"));
  it("classifies network errors as retryable",()=>expect(classifyApiError(new Error("Failed to fetch")).retryable).toBe(true));
});
