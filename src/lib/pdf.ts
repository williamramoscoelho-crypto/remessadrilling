import { jsPDF } from "jspdf";
import {
  moeda,
  origemFinal,
  tituloDocumento,
  valorTotal,
  type FormularioFiscal,
} from "./fiscal";

const AZUL: [number, number, number] = [23, 69, 127];
const AZUL_CLARO: [number, number, number] = [235, 240, 248];
const AMBAR: [number, number, number] = [214, 143, 20];
const GRAFITE: [number, number, number] = [38, 44, 54];
const CINZA: [number, number, number] = [110, 118, 130];
const LINHA: [number, number, number] = [206, 213, 222];

const M = 14; // margem
const L = 210 - M * 2; // largura útil

type Ctx = { doc: jsPDF; y: number };

function num(v: string) {
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

function texto(doc: jsPDF, t: string, x: number, y: number) {
  doc.text(t || "-", x, y);
}

function cabecalho(doc: jsPDF, f: FormularioFiscal, protocolo: string, emitidoEm: Date) {
  const romaneio = f.documento === "Romaneio";
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, 210, 30, "F");
  doc.setFillColor(...AMBAR);
  doc.rect(0, 30, 210, 1.6, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("DRILLING DO BRASIL", M, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(214, 226, 244);
  doc.text("Fundações e Sondagens · Controle Logístico e Fiscal", M, 18.5);
  doc.text(
    romaneio
      ? "Documento interno de acompanhamento de carga"
      : "Documento de conferência para emissão de Nota Fiscal",
    M,
    23,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  const titulo = tituloDocumento(f).toUpperCase();
  doc.text(titulo, 210 - M, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(214, 226, 244);
  const numeroLabel = romaneio
    ? `ROMANEIO Nº ${f.romaneioNumero || "—"}`
    : `PROTOCOLO ${protocolo || "—"}`;
  doc.text(numeroLabel, 210 - M, 18.5, { align: "right" });
  doc.text(
    `Emitido em ${emitidoEm.toLocaleDateString("pt-BR")} às ${emitidoEm.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    210 - M,
    23,
    { align: "right" },
  );
}

function secao(ctx: Ctx, titulo: string, altura: number) {
  const { doc } = ctx;
  doc.setFillColor(...AZUL_CLARO);
  doc.setDrawColor(...LINHA);
  doc.roundedRect(M, ctx.y, L, altura, 2, 2, "FD");
  doc.setFillColor(...AZUL);
  doc.rect(M, ctx.y, 2.4, altura, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...AZUL);
  doc.text(titulo.toUpperCase(), M + 6, ctx.y + 5.6);
}

function campo(doc: jsPDF, rotulo: string, valor: string, x: number, y: number, w: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...CINZA);
  doc.text(rotulo.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAFITE);
  const linhas = doc.splitTextToSize(valor || "-", w) as string[];
  texto(doc, linhas[0] ?? "-", x, y + 4.6);
  if (linhas[1]) {
    doc.setFontSize(8);
    doc.text(linhas[1], x, y + 8.6);
  }
}

export function gerarDocumentoPdf(
  f: FormularioFiscal,
  opcoes: { protocolo?: string | undefined } = {},
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const agora = new Date();
  const romaneio = f.documento === "Romaneio";
  cabecalho(doc, f, opcoes.protocolo || "", agora);

  const ctx: Ctx = { doc, y: 39 };

  // Operação
  secao(ctx, "1. Operação", 22);
  campo(doc, "Natureza da operação", f.tipoOperacao, M + 6, ctx.y + 11, 105);
  campo(
    doc,
    romaneio ? "Nº do romaneio" : "Modalidade de transporte",
    romaneio ? f.romaneioNumero || "—" : f.transporte,
    M + 120,
    ctx.y + 11,
    55,
  );
  ctx.y += 22 + 5;

  // Transporte
  const terceiro = f.transporte === "Transportador Terceirizado";
  const hTransp = terceiro ? 41 : 30;
  secao(ctx, "2. Transporte e motorista", hTransp);
  campo(doc, "Transporte", f.transporte, M + 6, ctx.y + 11, 60);
  campo(doc, "Motorista", f.motoristaNome, M + 72, ctx.y + 11, 55);
  campo(doc, "CPF", f.motoristaCpf, M + 132, ctx.y + 11, 45);
  campo(doc, "Placa cavalo", f.placaCavalo.toUpperCase(), M + 6, ctx.y + 22, 40);
  campo(doc, "Placa carreta", f.placaCarreta.toUpperCase(), M + 72, ctx.y + 22, 40);
  if (terceiro) {
    campo(doc, "Transportadora", f.transportadoraRazao, M + 6, ctx.y + 33, 60);
    campo(doc, "CNPJ", f.transportadoraCnpj, M + 72, ctx.y + 33, 55);
    campo(doc, "ANTT / RNTRC", f.transportadoraAntt, M + 132, ctx.y + 33, 45);
  }
  ctx.y += hTransp + 5;

  // Origem / destino
  secao(ctx, "3. Origem e destino", 33);
  campo(doc, "Origem", origemFinal(f), M + 6, ctx.y + 11, 80);
  campo(doc, "Obra de destino", f.destinoObra, M + 96, ctx.y + 11, 80);
  campo(doc, "Endereço de entrega", f.destinoEndereco, M + 6, ctx.y + 23, 170);
  ctx.y += 33 + 5;

  // Itens
  const itens = f.itens.filter((i) => i.descricao.trim() || num(i.valor) > 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...AZUL);
  doc.text(romaneio ? "4. RELAÇÃO DE MATERIAIS" : "4. DISCRIMINAÇÃO DOS PRODUTOS", M, ctx.y + 4);
  ctx.y += 7;

  const colX = [M + 3, M + 14, M + 98, M + 126, M + 152, M + L - 3];
  doc.setFillColor(...AZUL);
  doc.rect(M, ctx.y, L, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.2);
  doc.text("ITEM", colX[0]!, ctx.y + 4.7);
  doc.text("DESCRIÇÃO", colX[1]!, ctx.y + 4.7);
  doc.text("QTD.", colX[2]!, ctx.y + 4.7);
  doc.text("PESO (KG)", colX[3]!, ctx.y + 4.7, { align: "right" });
  doc.text("VLR. UNIT.", colX[4]!, ctx.y + 4.7, { align: "right" });
  doc.text("TOTAL", colX[5]!, ctx.y + 4.7, { align: "right" });
  ctx.y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  (itens.length ? itens : f.itens).forEach((item, n) => {
    const desc = doc.splitTextToSize(item.descricao || "-", 82) as string[];
    const h = Math.max(8, desc.length * 4.2 + 3.6);
    if (ctx.y + h > 250) {
      doc.addPage();
      ctx.y = 20;
    }
    if (n % 2 === 1) {
      doc.setFillColor(246, 248, 251);
      doc.rect(M, ctx.y, L, h, "F");
    }
    doc.setDrawColor(...LINHA);
    doc.line(M, ctx.y + h, M + L, ctx.y + h);
    doc.setTextColor(...GRAFITE);
    doc.text(String(n + 1).padStart(2, "0"), colX[0]!, ctx.y + 5.4);
    desc.slice(0, 3).forEach((linha, k) => doc.text(linha, colX[1]!, ctx.y + 5.4 + k * 4.2));
    doc.text(item.quantidade || "0", colX[2]!, ctx.y + 5.4);
    doc.text(num(item.peso) ? num(item.peso).toLocaleString("pt-BR") : "-", colX[3]!, ctx.y + 5.4, {
      align: "right",
    });
    doc.text(num(item.valor) ? moeda(num(item.valor)) : "-", colX[4]!, ctx.y + 5.4, {
      align: "right",
    });
    doc.setFont("helvetica", "bold");
    doc.text(
      moeda(num(item.quantidade) * num(item.valor)),
      colX[5]!,
      ctx.y + 5.4,
      { align: "right" },
    );
    doc.setFont("helvetica", "normal");
    ctx.y += h;
  });

  ctx.y += 5;
  if (ctx.y > 215) {
    doc.addPage();
    ctx.y = 20;
  }

  // Totais
  doc.setFillColor(...AZUL_CLARO);
  doc.setDrawColor(...LINHA);
  doc.roundedRect(M, ctx.y, L, 18, 2, 2, "FD");
  campo(doc, "Peso bruto total", `${f.pesoBruto || "0"} kg`, M + 6, ctx.y + 7, 40);
  campo(doc, "Volumes", f.volumes || "0", M + 60, ctx.y + 7, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...CINZA);
  doc.text(
    romaneio ? "VALOR TOTAL DA CARGA" : "VALOR TOTAL DA NOTA",
    M + L - 6,
    ctx.y + 7,
    { align: "right" },
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...AZUL);
  doc.text(moeda(valorTotal(f.itens)), M + L - 6, ctx.y + 13.5, { align: "right" });
  ctx.y += 18 + 5;

  // Observações
  const obs = f.observacoes.trim();
  const obsLinhas = doc.splitTextToSize(obs || "—", L - 12) as string[];
  const hObs = Math.max(20, 12 + obsLinhas.length * 4.2);
  secao(ctx, "5. Observações", hObs);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAFITE);
  obsLinhas.slice(0, 6).forEach((linha, k) => doc.text(linha, M + 6, ctx.y + 11 + k * 4.2));
  ctx.y += hObs + 10;

  // Assinaturas
  if (ctx.y > 268) {
    doc.addPage();
    ctx.y = 40;
  }
  const larguraAss = (L - 10) / 2;
  [
    ["Responsável pela expedição", "Nome legível / matrícula"],
    [romaneio ? "Recebedor na obra" : "Motorista / transportador", "Nome legível / documento"],
  ].forEach(([titulo, sub], i) => {
    const x = M + i * (larguraAss + 10);
    doc.setDrawColor(...GRAFITE);
    doc.line(x, ctx.y, x + larguraAss, ctx.y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAFITE);
    doc.text(titulo!, x, ctx.y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    doc.text(sub!, x, ctx.y + 8.5);
  });

  // Rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...LINHA);
    doc.line(M, 283, 210 - M, 283);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    doc.text(
      romaneio
        ? "Romaneio de carga — documento interno, não substitui documento fiscal."
        : "Espelho de Nota de Remessa — documento de conferência, não possui validade fiscal.",
      M,
      288,
    );
    doc.text(`Página ${p} de ${total}`, 210 - M, 288, { align: "right" });
  }

  return doc;
}

export function nomeArquivoPdf(f: FormularioFiscal, protocolo?: string) {
  const base = f.documento === "Romaneio" ? "ROMANEIO" : "ESPELHO-NF-REMESSA";
  const ref = (f.documento === "Romaneio" ? f.romaneioNumero : protocolo) || "";
  const obra = f.destinoObra.trim().replace(/[^\w]+/g, "-").toUpperCase().slice(0, 20);
  return [base, ref.replace(/[^\w-]+/g, ""), obra].filter(Boolean).join("_") + ".pdf";
}

export function baixarPdf(f: FormularioFiscal, protocolo?: string) {
  const doc = gerarDocumentoPdf(f, { protocolo });
  doc.save(nomeArquivoPdf(f, protocolo));
}

export async function compartilharPdf(f: FormularioFiscal, protocolo?: string) {
  const doc = gerarDocumentoPdf(f, { protocolo });
  const nome = nomeArquivoPdf(f, protocolo);
  const blob = doc.output("blob");
  const arquivo = new File([blob], nome, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [arquivo] }) && nav.share) {
    await nav.share({ files: [arquivo], title: tituloDocumento(f) });
    return true;
  }
  doc.save(nome);
  return false;
}
