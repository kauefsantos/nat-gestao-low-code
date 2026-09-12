import { FileText, Upload } from "lucide-react";
import { useId, useState } from "react";
import { parseRecipeCsv } from "@/domain/recipe-csv";
import type { RecipeItem, Supply } from "@/domain/nat";

const ALLOWED_CSV_MIME_TYPES = new Set(["text/csv","application/csv","application/vnd.ms-excel","text/plain"]);

export function RecipeCsvImporter({ supplies,onImport,hasRecipe }: { supplies: Supply[]; onImport: (items: RecipeItem[]) => void; hasRecipe: boolean }) {
  const textareaId = useId(); const fileId = useId();
  const [text,setText] = useState(""); const [errors,setErrors] = useState<string[]>([]); const [message,setMessage] = useState("");
  function apply() {
    const parsed = parseRecipeCsv(text,supplies); setErrors(parsed.errors); setMessage("");
    if (parsed.errors.length || !parsed.items.length) return;
    if (hasRecipe && typeof window !== "undefined" && !window.confirm("Substituir a receita atual pelos itens do CSV?")) return;
    onImport(parsed.items); setMessage(`${parsed.items.length} item(ns) aplicados à receita.`);
  }
  async function loadFile(file: File | undefined) {
    if (!file) return;
    const fileName = file.name.toLocaleLowerCase("pt-BR");
    if (!fileName.endsWith(".csv")) { setErrors(["Envie um arquivo com extensão .csv."]); return; }
    if (file.type && !ALLOWED_CSV_MIME_TYPES.has(file.type.toLocaleLowerCase("en-US"))) { setErrors(["O tipo do arquivo não é compatível com CSV de texto."]); return; }
    if (file.size > 500_000) { setErrors(["O CSV deve ter no máximo 500 KB."]); return; }
    const content = await file.text();
    const parsed = parseRecipeCsv(content,supplies);
    if (parsed.errors.some((error) => error.includes("dados binários") || error.includes("longo demais") || error.includes("no máximo 500"))) {
      setText(""); setErrors(parsed.errors); setMessage(""); return;
    }
    setText(content); setErrors([]); setMessage("");
  }
  return <details className="rounded-2xl border border-nat p-4"><summary className="cursor-pointer font-bold">Importar receita por CSV</summary><div className="mt-4 space-y-4"><p className="text-sm leading-6 text-caramel">Cole ou envie um CSV com <strong>Ingrediente;Quantidade;Unidade</strong>. O nome precisa ser igual ao ingrediente já cadastrado. Ex.: <code>Chocolate;150;g</code>.</p><div><label htmlFor={textareaId} className="field-label">Conteúdo do CSV</label><textarea id={textareaId} className="nat-input min-h-36 resize-y font-mono text-xs" value={text} onChange={(event) => setText(event.target.value)} placeholder={"Ingrediente;Quantidade;Unidade\nChocolate;150;g\nOvos;2;un"}/></div><div className="flex flex-wrap gap-2"><label htmlFor={fileId} className="secondary-button cursor-pointer"><Upload size={17}/> Escolher arquivo CSV</label><input id={fileId} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void loadFile(event.target.files?.[0])}/><button type="button" className="primary-button" onClick={apply} disabled={!text.trim() || supplies.length===0}><FileText size={17}/> Aplicar CSV</button></div>{hasRecipe && <p className="field-help">Ao aplicar, a receita atual será substituída após sua confirmação.</p>}{errors.length>0 && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><p className="font-bold">Corrija o CSV:</p><ul className="mt-1 list-disc space-y-1 pl-5">{errors.slice(0,8).map((error) => <li key={error}>{error}</li>)}</ul></div>}{message && <p role="status" className="rounded-xl bg-rose-soft p-3 text-sm text-chocolate">{message}</p>}</div></details>;
}
