import { montarEspelho, tituloDocumento, valorTotal, type FormularioFiscal } from "./fiscal";

/**
 * Arquivo (documento) emitido pelo app e guardado localmente no dispositivo.
 * Permite consultar, editar, baixar novamente e excluir emissões anteriores.
 */
export type ArquivoEmitido = {
  id: string;
  protocolo: string;
  criadoEm: string;
  atualizadoEm: string;
  titulo: string;
  destino: string;
  total: number;
  espelho: string;
  dados: FormularioFiscal;
};

export const CHAVE_ARQUIVOS = "drilling_arquivos_v1";

function seguro<T>(fn: () => T, padrao: T): T {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

export function lerArquivos(): ArquivoEmitido[] {
  if (typeof localStorage === "undefined") return [];
  return seguro(
    () => JSON.parse(localStorage.getItem(CHAVE_ARQUIVOS) || "[]") as ArquivoEmitido[],
    [],
  ).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

function gravar(lista: ArquivoEmitido[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHAVE_ARQUIVOS, JSON.stringify(lista));
}

export function lerArquivo(id: string): ArquivoEmitido | undefined {
  return lerArquivos().find((a) => a.id === id);
}

/** Cria ou atualiza (quando `id` já existe) um arquivo e devolve o registro salvo. */
export function salvarArquivo(
  dados: FormularioFiscal,
  opcoes: { id?: string; protocolo?: string } = {},
): ArquivoEmitido {
  const lista = lerArquivos();
  const agora = new Date().toISOString();
  const existente = opcoes.id ? lista.find((a) => a.id === opcoes.id) : undefined;

  const registro: ArquivoEmitido = {
    id: existente?.id ?? novoId(),
    protocolo: opcoes.protocolo || existente?.protocolo || "",
    criadoEm: existente?.criadoEm ?? agora,
    atualizadoEm: agora,
    titulo: tituloDocumento(dados),
    destino: dados.destinoObra || "Sem destino informado",
    total: valorTotal(dados.itens),
    espelho: montarEspelho(dados),
    dados,
  };

  const restantes = lista.filter((a) => a.id !== registro.id);
  gravar([registro, ...restantes]);
  return registro;
}

export function excluirArquivo(id: string) {
  gravar(lerArquivos().filter((a) => a.id !== id));
}

export function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function dataBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
