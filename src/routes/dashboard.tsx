import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  CalendarDays,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Package,
  Scale,
  Search,
  Truck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { jsPDF } from "jspdf";
import logo from "@/assets/drilling-logo.png";
import { moeda } from "@/lib/fiscal";
import { dataBr, lerArquivos, type ArquivoEmitido } from "@/lib/arquivos";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard e relatórios | Drilling Fiscal" },
      {
        name: "description",
        content:
          "Painel gerencial da Drilling do Brasil com indicadores, gráficos e relatórios dos espelhos de nota e romaneios emitidos.",
      },
      { property: "og:title", content: "Dashboard e relatórios | Drilling Fiscal" },
      {
        property: "og:description",
        content:
          "Indicadores, gráficos e exportação de relatórios dos documentos emitidos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

const PERIODOS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "365", rotulo: "Últimos 12 meses" },
  { valor: "tudo", rotulo: "Todo o histórico" },
] as const;

const CORES = {
  azul: "#046bd2",
  azulEscuro: "#045cb4",
  laranja: "#e8841c",
  ambar: "#d68f14",
  verde: "#159a6c",
  grafite: "#1e293b",
};

const mesRotulo = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

const num = (v: string) =>
  parseFloat(String(v || "").replace(/\./g, "").replace(",", ".")) || 0;

function DashboardPage() {
  const [arquivos, setArquivos] = useState<ArquivoEmitido[]>([]);
  const [periodo, setPeriodo] = useState<string>("90");
  const [tipo, setTipo] = useState<string>("todos");
  const [destino, setDestino] = useState("");

  useEffect(() => {
    const atualizar = () => setArquivos(lerArquivos());
    atualizar();
    window.addEventListener("focus", atualizar);
    return () => window.removeEventListener("focus", atualizar);
  }, []);

  const filtrados = useMemo(() => {
    const limite =
      periodo === "tudo"
        ? null
        : Date.now() - Number(periodo) * 24 * 60 * 60 * 1000;
    const termo = destino.trim().toLowerCase();
    return arquivos.filter((a) => {
      if (limite && new Date(a.atualizadoEm).getTime() < limite) return false;
      if (tipo !== "todos" && a.dados.documento !== tipo) return false;
      if (termo && !a.destino.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [arquivos, periodo, tipo, destino]);

  const kpis = useMemo(() => {
    const total = filtrados.reduce((acc, a) => acc + a.total, 0);
    const peso = filtrados.reduce((acc, a) => acc + num(a.dados.pesoBruto), 0);
    const nfs = filtrados.filter((a) => a.dados.documento !== "Romaneio").length;
    return {
      total,
      docs: filtrados.length,
      ticket: filtrados.length ? total / filtrados.length : 0,
      peso,
      nfs,
      romaneios: filtrados.length - nfs,
    };
  }, [filtrados]);

  const evolucao = useMemo(() => {
    const mapa = new Map<string, { mes: string; valor: number; docs: number }>();
    [...filtrados]
      .sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm))
      .forEach((a) => {
        const d = new Date(a.atualizadoEm);
        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const atual = mapa.get(chave) ?? {
          mes: mesRotulo(a.atualizadoEm),
          valor: 0,
          docs: 0,
        };
        atual.valor += a.total;
        atual.docs += 1;
        mapa.set(chave, atual);
      });
    return [...mapa.values()];
  }, [filtrados]);

  const topDestinos = useMemo(() => {
    const mapa = new Map<string, number>();
    filtrados.forEach((a) =>
      mapa.set(a.destino, (mapa.get(a.destino) ?? 0) + a.total),
    );
    return [...mapa.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);
  }, [filtrados]);

  const pizzaTipo = useMemo(
    () => [
      { nome: "Espelho de NF", valor: kpis.nfs },
      { nome: "Romaneio", valor: kpis.romaneios },
    ],
    [kpis],
  );

  const rankingItens = useMemo(() => {
    const mapa = new Map<string, { qtd: number; valor: number }>();
    filtrados.forEach((a) =>
      a.dados.itens.forEach((i) => {
        const nome = i.descricao.trim() || "Sem descrição";
        const atual = mapa.get(nome) ?? { qtd: 0, valor: 0 };
        atual.qtd += num(i.quantidade);
        atual.valor += num(i.quantidade) * num(i.valor);
        mapa.set(nome, atual);
      }),
    );
    return [...mapa.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [filtrados]);

  const exportarCsv = () => {
    const linhas = [
      ["Data", "Documento", "Protocolo", "Destino", "Itens", "Peso bruto (kg)", "Valor total (R$)"],
      ...filtrados.map((a) => [
        dataBr(a.atualizadoEm),
        a.titulo,
        a.protocolo || "-",
        a.destino,
        String(a.dados.itens.length),
        String(num(a.dados.pesoBruto)).replace(".", ","),
        a.total.toFixed(2).replace(".", ","),
      ]),
    ];
    const csv = "\uFEFF" + linhas.map((l) => l.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-drilling-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPdf = () => {
    const doc = new jsPDF();
    doc.setFillColor(4, 107, 210);
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("DRILLING DO BRASIL — RELATÓRIO GERENCIAL", 14, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `Período: ${PERIODOS.find((p) => p.valor === periodo)?.rotulo} · Tipo: ${tipo} · Gerado em ${dataBr(new Date().toISOString())}`,
      14,
      17,
    );

    doc.setTextColor(38, 44, 54);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo do período", 14, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const resumo = [
      `Documentos emitidos: ${kpis.docs} (${kpis.nfs} espelhos de NF, ${kpis.romaneios} romaneios)`,
      `Valor total movimentado: ${moeda(kpis.total)}`,
      `Ticket médio por documento: ${moeda(kpis.ticket)}`,
      `Peso bruto total: ${kpis.peso.toLocaleString("pt-BR")} kg`,
    ];
    resumo.forEach((l, i) => doc.text(l, 14, 40 + i * 5.5));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Documentos do período", 14, 68);
    doc.setFontSize(8);
    let y = 76;
    doc.setFont("helvetica", "bold");
    doc.text("Data", 14, y);
    doc.text("Documento", 44, y);
    doc.text("Destino", 96, y);
    doc.text("Valor", 182, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 2;
    doc.setDrawColor(206, 213, 222);
    doc.line(14, y, 196, y);
    y += 5;
    filtrados.slice(0, 40).forEach((a) => {
      if (y > 282) {
        doc.addPage();
        y = 20;
      }
      doc.text(dataBr(a.atualizadoEm), 14, y);
      doc.text(a.titulo.slice(0, 26), 44, y);
      doc.text(a.destino.slice(0, 42), 96, y);
      doc.text(moeda(a.total), 182, y, { align: "right" });
      y += 5;
    });
    doc.save(`relatorio-drilling-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const vazio = filtrados.length === 0;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 border-b border-primary/30 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="flex size-9 items-center justify-center rounded-md bg-primary-foreground/15"
            aria-label="Voltar para o formulário"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <img
            src={logo}
            alt="Drilling do Brasil"
            className="h-7 w-auto rounded bg-white p-0.5"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold uppercase leading-none">Dashboard</h1>
            <p className="text-[11px] uppercase tracking-widest opacity-80">
              Indicadores e relatórios
            </p>
          </div>
          <Link
            to="/arquivos"
            className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-semibold uppercase"
          >
            <FolderOpen className="size-3.5" /> Arquivos
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pt-6">
        {/* Filtros */}
        <section className="rounded-xl border bg-card p-4 shadow-panel">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <CalendarDays className="size-4" /> Filtros
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Período</span>
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {PERIODOS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Tipo de documento
              </span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="Espelho de Nota de Remessa">Espelho de NF</option>
                <option value="Romaneio">Romaneio</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Destino</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  placeholder="Filtrar por obra/destino"
                  className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={exportarCsv}
              disabled={vazio}
              className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase text-primary-foreground disabled:opacity-50"
            >
              <FileSpreadsheet className="size-4" /> Exportar CSV
            </button>
            <button
              onClick={exportarPdf}
              disabled={vazio}
              className="flex items-center gap-2 rounded-md border border-primary bg-background px-3 py-2 text-xs font-bold uppercase text-primary disabled:opacity-50"
            >
              <Download className="size-4" /> Relatório em PDF
            </button>
          </div>
        </section>

        {vazio ? (
          <section className="rounded-xl border border-dashed bg-card p-10 text-center shadow-panel">
            <FileText className="mx-auto mb-3 size-10 text-muted-foreground" />
            <p className="font-semibold">Nenhum documento encontrado para os filtros.</p>
            <p className="text-sm text-muted-foreground">
              Emita um espelho de NF ou romaneio na tela inicial para alimentar o painel.
            </p>
          </section>
        ) : (
          <>
            {/* KPIs */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                {
                  rotulo: "Valor movimentado",
                  valor: moeda(kpis.total),
                  icone: Banknote,
                  cor: "bg-primary/10 text-primary",
                },
                {
                  rotulo: "Documentos",
                  valor: `${kpis.docs} (${kpis.nfs} NF · ${kpis.romaneios} ROM)`,
                  icone: FileText,
                  cor: "bg-warning/15 text-warning",
                },
                {
                  rotulo: "Ticket médio",
                  valor: moeda(kpis.ticket),
                  icone: BarChart3,
                  cor: "bg-success/15 text-success",
                },
                {
                  rotulo: "Peso bruto total",
                  valor: `${kpis.peso.toLocaleString("pt-BR")} kg`,
                  icone: Scale,
                  cor: "bg-accent/10 text-accent",
                },
              ].map((k) => (
                <article
                  key={k.rotulo}
                  className="rounded-xl border bg-card p-4 shadow-panel"
                >
                  <div className={`mb-2 flex size-9 items-center justify-center rounded-lg ${k.cor}`}>
                    <k.icone className="size-5" />
                  </div>
                  <p className="text-lg font-bold leading-tight">{k.valor}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {k.rotulo}
                  </p>
                </article>
              ))}
            </section>

            {/* Evolução */}
            <section className="rounded-xl border bg-card p-4 shadow-panel">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Evolução do valor emitido
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucao} margin={{ left: 8, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="gradValor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CORES.azul} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CORES.azul} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe4" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#7c8698" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#7c8698"
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")}k` : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(v: number | string | undefined) => [
                        moeda(Number(v ?? 0)),
                        "Valor",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke={CORES.azul}
                      strokeWidth={2.5}
                      fill="url(#gradValor)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top destinos */}
              <section className="rounded-xl border bg-card p-4 shadow-panel">
                <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Truck className="size-4" /> Top destinos por valor
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topDestinos} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d5dbe4" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="nome"
                        width={130}
                        tick={{ fontSize: 11 }}
                        stroke="#7c8698"
                      />
                      <Tooltip
                        formatter={(v: number | string | undefined) => [
                          moeda(Number(v ?? 0)),
                          "Valor",
                        ]}
                      />
                      <Bar dataKey="valor" fill={CORES.azulEscuro} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Tipo de documento */}
              <section className="rounded-xl border bg-card p-4 shadow-panel">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Documentos por tipo
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pizzaTipo}
                        dataKey="valor"
                        nameKey="nome"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        label={({ name, percent }) =>
                          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        <Cell fill={CORES.azul} />
                        <Cell fill={CORES.laranja} />
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {/* Ranking de itens */}
            <section className="rounded-xl border bg-card p-4 shadow-panel">
              <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Package className="size-4" /> Itens mais movimentados
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 pr-4 font-semibold">Item</th>
                      <th className="pb-2 pr-4 text-right font-semibold">Qtd.</th>
                      <th className="pb-2 text-right font-semibold">Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingItens.map((i) => (
                      <tr key={i.nome} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{i.nome}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {i.qtd.toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {moeda(i.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
