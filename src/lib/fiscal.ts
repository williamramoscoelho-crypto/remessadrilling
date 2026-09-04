export type ItemCarga = {
  id: string;
  descricao: string;
  quantidade: string;
  peso: string;
  valor: string;
};

export type TipoDocumento = "Romaneio" | "Espelho de Nota de Remessa";

export type FormularioFiscal = {
  documento: TipoDocumento;
  romaneioNumero: string;
  transporte: "Frota Própria (Drilling)" | "Transportador Terceirizado";
  transportadoraRazao: string;
  transportadoraCnpj: string;
  transportadoraAntt: string;
  tipoOperacao: string;
  origem: string;
  origemOutro: string;
  destinoObra: string;
  destinoEndereco: string;
  motoristaNome: string;
  motoristaCpf: string;
  placaCavalo: string;
  placaCarreta: string;
  itens: ItemCarga[];
  pesoBruto: string;
  volumes: string;
  observacoes: string;
};

export const TIPOS_OPERACAO = [
  "Remessa de Ativo Imobilizado (CFOP 6554)",
  "Remessa para Conserto / Reparo",
  "Retorno de Obra / Devolução",
  "Retorno de Conserto / Reparo",
  "Transferência entre Obras",
];

export const ORIGENS = [
  "Pátio São José da Lapa - MG",
  "Obra Recife - PE",
  "Outro...",
];

export const novoItem = (): ItemCarga => ({
  id: Math.random().toString(36).slice(2, 9),
  descricao: "",
  quantidade: "1",
  peso: "",
  valor: "",
});

export const formularioInicial = (): FormularioFiscal => ({
  documento: "Espelho de Nota de Remessa",
  romaneioNumero: "",
  transporte: "Frota Própria (Drilling)",
  transportadoraRazao: "",
  transportadoraCnpj: "",
  transportadoraAntt: "",
  tipoOperacao: TIPOS_OPERACAO[0]!,
  origem: ORIGENS[0]!,
  origemOutro: "",
  destinoObra: "",
  destinoEndereco: "",
  motoristaNome: "",
  motoristaCpf: "",
  placaCavalo: "",
  placaCarreta: "",
  itens: [novoItem()],
  pesoBruto: "16000",
  volumes: "3",
  observacoes: "",
});

export const tituloDocumento = (f: FormularioFiscal) =>
  f.documento === "Romaneio" ? "Romaneio de Carga" : "Espelho de Nota de Remessa";

export const origemFinal = (f: FormularioFiscal) =>
  f.origem === "Outro..." ? f.origemOutro : f.origem;

export const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const valorTotal = (itens: ItemCarga[]) =>
  itens.reduce((acc, i) => {
    const q = parseFloat(i.quantidade.replace(",", ".")) || 0;
    const v = parseFloat(i.valor.replace(/\./g, "").replace(",", ".")) || 0;
    return acc + q * v;
  }, 0);

export function montarEspelho(f: FormularioFiscal): string {
  const linhas: string[] = [];
  linhas.push(`*${tituloDocumento(f).toUpperCase()} — DRILLING DO BRASIL*`);
  if (f.documento === "Romaneio") linhas.push(`Romaneio nº: ${f.romaneioNumero || "-"}`);
  linhas.push(`Operação: ${f.tipoOperacao}`);
  linhas.push(`Transporte: ${f.transporte}`);
  if (f.transporte === "Transportador Terceirizado") {
    linhas.push(
      `Transportadora: ${f.transportadoraRazao || "-"} | CNPJ: ${f.transportadoraCnpj || "-"} | ANTT/RNTRC: ${f.transportadoraAntt || "-"}`,
    );
  }
  linhas.push("");
  linhas.push(`*Origem:* ${origemFinal(f) || "-"}`);
  linhas.push(`*Destino:* ${f.destinoObra || "-"} — ${f.destinoEndereco || "-"}`);
  linhas.push("");
  linhas.push(`*Motorista:* ${f.motoristaNome || "-"} | CPF: ${f.motoristaCpf || "-"}`);
  linhas.push(
    `*Placas:* Cavalo ${f.placaCavalo.toUpperCase() || "-"} | Carreta ${f.placaCarreta.toUpperCase() || "-"}`,
  );
  linhas.push("");
  linhas.push("*CARGA:*");
  f.itens.forEach((i, n) => {
    const q = parseFloat(i.quantidade.replace(",", ".")) || 0;
    const v = parseFloat(i.valor.replace(/\./g, "").replace(",", ".")) || 0;
    linhas.push(
      `${n + 1}) ${i.descricao || "-"} — Qtd ${i.quantidade || "0"} — Peso ${i.peso || "0"} kg — ${moeda(q * v)}`,
    );
  });
  linhas.push("");
  linhas.push(`Peso bruto total: ${f.pesoBruto || "0"} kg`);
  linhas.push(`Volumes: ${f.volumes || "0"}`);
  linhas.push(`Valor total estimado: ${moeda(valorTotal(f.itens))}`);
  if (f.observacoes.trim()) linhas.push(`Obs.: ${f.observacoes.trim()}`);
  return linhas.join("\n");
}

export const CHAVE_FILA = "drilling_fila_offline_v1";

export type EnvioPendente = {
  id: string;
  criadoEm: string;
  dados: FormularioFiscal;
};

export function lerFila(): EnvioPendente[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FILA) || "[]") as EnvioPendente[];
  } catch {
    return [];
  }
}

export function gravarFila(fila: EnvioPendente[]) {
  localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
}

export const API_URL = "/api/salvar.php";

export async function enviarPreEmissao(
  dados: FormularioFiscal,
  arquivos?: { cnh?: File | null; carregamento?: File | null },
): Promise<{ ok: boolean; protocolo?: string; erro?: string }> {
  const body = new FormData();
  body.append("payload", JSON.stringify({ ...dados, origem: origemFinal(dados) }));
  if (arquivos?.cnh) body.append("cnh", arquivos.cnh);
  if (arquivos?.carregamento) body.append("carregamento", arquivos.carregamento);

  const resposta = await fetch(API_URL, { method: "POST", body });
  const texto = await resposta.text();
  let json: { ok?: boolean; erro?: string; protocolo?: string } = {};
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "Resposta inválida do servidor." };
  }
  if (!resposta.ok || !json.ok) {
    return { ok: false, erro: String(json.erro || "Falha no envio.") };
  }
  return { ok: true, protocolo: String(json.protocolo || "") };
}
