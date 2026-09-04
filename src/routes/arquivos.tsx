import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Download,
  FileText,
  LayoutDashboard,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import logo from "@/assets/drilling-logo.png";
import { moeda } from "@/lib/fiscal";
import { baixarPdf } from "@/lib/pdf";
import { dataBr, excluirArquivo, lerArquivos, type ArquivoEmitido } from "@/lib/arquivos";

export const Route = createFileRoute("/arquivos")({
  head: () => ({
    meta: [
      { title: "Arquivos emitidos | Drilling Fiscal" },
      {
        name: "description",
        content:
          "Consulte, edite e baixe novamente os espelhos de nota e romaneios já emitidos pela equipe da Drilling do Brasil.",
      },
      { property: "og:title", content: "Arquivos emitidos | Drilling Fiscal" },
      {
        property: "og:description",
        content: "Histórico de espelhos de nota e romaneios com download em PDF e edição.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Arquivos,
});

function Arquivos() {
  const [arquivos, setArquivos] = useState<ArquivoEmitido[]>([]);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    setArquivos(lerArquivos());
  }, []);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return arquivos;
    return arquivos.filter((a) =>
      [a.titulo, a.destino, a.protocolo, a.dados.motoristaNome, a.dados.placaCavalo, a.espelho]
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [arquivos, busca]);

  const copiar = async (a: ArquivoEmitido) => {
    try {
      await navigator.clipboard.writeText(a.espelho);
      setCopiado(a.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  };

  const baixarTxt = (a: ArquivoEmitido) => {
    const blob = new Blob([a.espelho], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${a.titulo.replace(/\s+/g, "-").toLowerCase()}-${a.id.slice(0, 6)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const remover = (id: string) => {
    if (!confirm("Excluir definitivamente este arquivo?")) return;
    excluirArquivo(id);
    setArquivos(lerArquivos());
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 border-b border-primary/30 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
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
            <h1 className="truncate text-base font-bold uppercase leading-none">Arquivos</h1>
            <p className="text-[11px] uppercase tracking-widest opacity-80">
              Emitidos e editados
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field-input pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por obra, motorista, placa ou protocolo"
          />
        </div>

        {filtrados.length === 0 && (
          <div className="panel text-center">
            <FileText className="mx-auto mb-2 size-8 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhum arquivo salvo ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao revisar ou enviar um espelho, ele fica guardado aqui neste dispositivo.
            </p>
          </div>
        )}

        {filtrados.map((a) => (
          <article key={a.id} className="panel">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold uppercase">{a.titulo}</h2>
                <p className="truncate text-sm text-foreground">{a.destino}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atualizado em {dataBr(a.atualizadoEm)}
                  {a.protocolo ? ` · Protocolo ${a.protocolo}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-primary">{moeda(a.total)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                onClick={() => baixarPdf(a.dados, a.protocolo)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-3 text-xs font-bold uppercase text-primary-foreground"
              >
                <Download className="size-4" /> PDF
              </button>
              <button
                onClick={() => baixarTxt(a)}
                className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-primary px-2 py-3 text-xs font-bold uppercase text-primary"
              >
                <FileText className="size-4" /> TXT
              </button>
              <Link
                to="/"
                search={{ arquivo: a.id }}
                className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-border px-2 py-3 text-xs font-bold uppercase text-foreground"
              >
                <Pencil className="size-4" /> Editar
              </Link>
              <button
                onClick={() => remover(a.id)}
                className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-destructive/40 px-2 py-3 text-xs font-bold uppercase text-destructive"
              >
                <Trash2 className="size-4" /> Excluir
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setAberto(aberto === a.id ? null : a.id)}
                className="flex-1 rounded-lg bg-secondary px-2 py-2 text-xs font-semibold uppercase text-secondary-foreground"
              >
                {aberto === a.id ? "Ocultar espelho" : "Ver espelho"}
              </button>
              <button
                onClick={() => void copiar(a)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-steel px-3 py-2 text-xs font-semibold uppercase text-primary-foreground"
              >
                {copiado === a.id ? (
                  <Check className="size-4" />
                ) : (
                  <ClipboardCopy className="size-4" />
                )}
                {copiado === a.id ? "Copiado" : "Copiar"}
              </button>
            </div>

            {aberto === a.id && (
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-[12px] leading-relaxed">
                {a.espelho}
              </pre>
            )}
          </article>
        ))}
      </main>
    </div>
  );
}
