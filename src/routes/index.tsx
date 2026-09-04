import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ClipboardCopy,
  CloudOff,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  FileText,
  Share2,
} from "lucide-react";
import logo from "@/assets/drilling-logo.png";
import {
  ORIGENS,
  TIPOS_OPERACAO,
  formularioInicial,
  gravarFila,
  lerFila,
  moeda,
  montarEspelho,
  novoItem,
  enviarPreEmissao,
  valorTotal,
  type FormularioFiscal,
  tituloDocumento,
  type ItemCarga,
} from "@/lib/fiscal";
import { baixarPdf, compartilharPdf } from "@/lib/pdf";
import { lerArquivo, salvarArquivo } from "@/lib/arquivos";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { arquivo?: string } => ({
    arquivo: typeof search["arquivo"] === "string" ? search["arquivo"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Drilling Fiscal | Pré-emissão de NF e CTe" },
      {
        name: "description",
        content:
          "Formulário rápido da Drilling do Brasil para pré-emissão de Nota Fiscal de remessa, reparo e CTe direto do canteiro de obras.",
      },
      { property: "og:title", content: "Drilling Fiscal | Pré-emissão de NF e CTe" },
      {
        property: "og:description",
        content:
          "Envie os dados de remessa, reparo e transporte em menos de 1 minuto, com anexo de CNH e espelho pronto para o setor fiscal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#046bd2" },
    ],
    links: [{ rel: "manifest", href: "/manifest.json" }],
  }),
  component: App,
});


type Etapa = "form" | "espelho" | "sucesso";

function App() {
  const { arquivo } = Route.useSearch();
  const [form, setForm] = useState<FormularioFiscal>(formularioInicial);
  const [arquivoId, setArquivoId] = useState<string | undefined>(undefined);
  const [etapa, setEtapa] = useState<Etapa>("form");
  const [cnh, setCnh] = useState<File | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const topo = useRef<HTMLDivElement>(null);

  // Carrega um arquivo já emitido para edição (rota "/?arquivo=<id>").
  useEffect(() => {
    if (!arquivo) return;
    const salvo = lerArquivo(arquivo);
    if (!salvo) return;
    setForm(salvo.dados);
    setArquivoId(salvo.id);
    setProtocolo(salvo.protocolo);
  }, [arquivo]);


  const set = <K extends keyof FormularioFiscal>(k: K, v: FormularioFiscal[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const espelho = useMemo(() => montarEspelho(form), [form]);
  const total = useMemo(() => valorTotal(form.itens), [form.itens]);

  const sincronizar = useCallback(async () => {
    const fila = lerFila();
    if (!fila.length || !navigator.onLine) return;
    setSincronizando(true);
    const restantes = [];
    for (const item of fila) {
      const r = await enviarPreEmissao(item.dados).catch(() => ({ ok: false }));
      if (!r.ok) restantes.push(item);
    }
    gravarFila(restantes);
    setPendentes(restantes.length);
    setSincronizando(false);
  }, []);

  useEffect(() => {
    const atualiza = () => setOnline(navigator.onLine);
    atualiza();
    setPendentes(lerFila().length);
    const aoVoltar = () => {
      atualiza();
      void sincronizar();
    };
    window.addEventListener("online", aoVoltar);
    window.addEventListener("offline", atualiza);
    void sincronizar();
    return () => {
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("offline", atualiza);
    };
  }, [sincronizar]);

  useEffect(() => {
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [etapa]);

  const atualizarItem = (id: string, campo: keyof ItemCarga, valor: string) =>
    setForm((f) => ({
      ...f,
      itens: f.itens.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)),
    }));

  const copiarEspelho = async () => {
    try {
      await navigator.clipboard.writeText(espelho);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = espelho;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  };

  /** No módulo Espelho de NF, todo item precisa de peso informado (> 0). */
  const pesoValido = (v: string) => (parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0) > 0;
  const exigePeso = form.documento === "Espelho de Nota de Remessa";
  const itemSemPeso = (i: ItemCarga) =>
    exigePeso && i.descricao.trim().length > 0 && !pesoValido(i.peso);

  const validar = () => {
    if (form.documento === "Romaneio" && !form.romaneioNumero.trim())
      return "Informe o número do romaneio.";
    if (!form.destinoObra.trim()) return "Informe o nome da obra de destino.";
    if (!form.motoristaNome.trim()) return "Informe o nome do motorista.";
    if (!form.placaCavalo.trim()) return "Informe a placa do cavalo.";
    if (!form.itens.some((i) => i.descricao.trim())) return "Adicione ao menos um item de carga.";
    if (exigePeso) {
      const idx = form.itens.findIndex(itemSemPeso);
      if (idx >= 0) return `Informe o peso (kg) do item ${idx + 1} da carga.`;
    }
    if (form.origem === "Outro..." && !form.origemOutro.trim())
      return "Descreva a origem personalizada.";
    if (form.transporte === "Transportador Terceirizado" && !form.transportadoraRazao.trim())
      return "Informe a razão social do transportador.";
    return "";
  };

  /** Salva/atualiza o arquivo no histórico local do dispositivo. */
  const registrarArquivo = (dados: FormularioFiscal, novoProtocolo?: string) => {
    try {
      const salvo = salvarArquivo(dados, { id: arquivoId, protocolo: novoProtocolo ?? protocolo });
      setArquivoId(salvo.id);
    } catch {
      /* histórico é opcional — nunca bloqueia o fluxo de emissão */
    }
  };

  const irParaEspelho = () => {
    const e = validar();
    setErro(e);
    if (!e) {
      registrarArquivo(form);
      setEtapa("espelho");
    }
  };

  const enviar = async () => {
    setEnviando(true);
    setErro("");
    if (!navigator.onLine) {
      const fila = lerFila();
      fila.push({ id: crypto.randomUUID(), criadoEm: new Date().toISOString(), dados: form });
      gravarFila(fila);
      setPendentes(fila.length);
      setProtocolo("OFFLINE — na fila de envio");
      registrarArquivo(form, "OFFLINE — na fila de envio");
      setEnviando(false);
      setEtapa("sucesso");
      return;
    }
    try {
      const r = await enviarPreEmissao(form, { cnh, carregamento: foto });
      if (r.ok) {
        setProtocolo(r.protocolo || "");
        registrarArquivo(form, r.protocolo || "");
        setEtapa("sucesso");
      } else {
        setErro(r.erro || "Falha no envio.");
      }
    } catch {
      const fila = lerFila();
      fila.push({ id: crypto.randomUUID(), criadoEm: new Date().toISOString(), dados: form });
      gravarFila(fila);
      setPendentes(fila.length);
      setProtocolo("OFFLINE — na fila de envio");
      registrarArquivo(form, "OFFLINE — na fila de envio");
      setEtapa("sucesso");
    } finally {
      setEnviando(false);
    }
  };

  const recomecar = () => {
    setForm(formularioInicial());
    setArquivoId(undefined);
    setCnh(null);
    setFoto(null);
    setProtocolo("");
    setErro("");
    setEtapa("form");
  };


  return (
    <div className="min-h-screen bg-background pb-28">
      <div ref={topo} />
      <header className="sticky top-0 z-20 border-b border-primary/30 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img
            src={logo}
            alt="Drilling do Brasil"
            className="h-9 w-auto shrink-0 brightness-0 invert"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xs uppercase tracking-widest opacity-80">
              Pré-emissão NF / CTe
            </h1>
          </div>

          <Link
            to="/arquivos"
            className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-semibold uppercase"
          >
            <FolderOpen className="size-3.5" /> Arquivos
          </Link>

          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
              online ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"
            }`}
          >
            {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}
            {online ? "Online" : "Offline"}
          </span>
        </div>
        {pendentes > 0 && (
          <button
            onClick={() => void sincronizar()}
            className="flex w-full items-center justify-center gap-2 bg-warning px-4 py-2 text-xs font-semibold uppercase text-warning-foreground"
          >
            {sincronizando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {pendentes} envio(s) pendente(s) — tocar para sincronizar
          </button>
        )}
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {etapa === "form" && (
          <>
            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">1. Tipo de documento</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["Espelho de Nota de Remessa", "Romaneio"] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => set("documento", op)}
                    className={`rounded-lg border-2 px-3 py-4 text-sm font-semibold transition-colors ${
                      form.documento === op
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {op === "Romaneio" ? "Romaneio (sem NF)" : "Espelho de Nota de Remessa"}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {form.documento === "Romaneio"
                  ? "Movimentações internas em MG/BH que não geram nota fiscal."
                  : "Gera o espelho para o setor fiscal emitir a Nota Fiscal de remessa."}
              </p>
              {form.documento === "Romaneio" && (
                <div className="mt-3 rounded-lg bg-muted p-3">
                  <label className="field-label">Nº do romaneio</label>
                  <input
                    className="field-input"
                    value={form.romaneioNumero}
                    onChange={(e) => set("romaneioNumero", e.target.value)}
                    placeholder="Ex.: 2026-0148"
                  />
                </div>
              )}
            </section>

            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">2. Transporte</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["Frota Própria (Drilling)", "Transportador Terceirizado"] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => set("transporte", op)}
                    className={`rounded-lg border-2 px-3 py-4 text-sm font-semibold transition-colors ${
                      form.transporte === op
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
              {form.transporte === "Transportador Terceirizado" && (
                <div className="mt-3 space-y-3 rounded-lg bg-muted p-3">
                  <div>
                    <label className="field-label">Razão social</label>
                    <input
                      className="field-input"
                      value={form.transportadoraRazao}
                      onChange={(e) => set("transportadoraRazao", e.target.value)}
                      placeholder="Transportadora LTDA"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">CNPJ</label>
                      <input
                        className="field-input"
                        inputMode="numeric"
                        value={form.transportadoraCnpj}
                        onChange={(e) => set("transportadoraCnpj", e.target.value)}
                        placeholder="00.000.000/0001-00"
                      />
                    </div>
                    <div>
                      <label className="field-label">ANTT / RNTRC</label>
                      <input
                        className="field-input"
                        inputMode="numeric"
                        value={form.transportadoraAntt}
                        onChange={(e) => set("transportadoraAntt", e.target.value)}
                        placeholder="00000000"
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">3. Tipo de operação</h2>
              <select
                className="field-input"
                value={form.tipoOperacao}
                onChange={(e) => set("tipoOperacao", e.target.value)}
              >
                {TIPOS_OPERACAO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </section>

            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">4. Fotos</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <FotoInput
                  titulo="CNH do motorista"
                  arquivo={cnh}
                  onChange={setCnh}
                  obrigatorio
                />
                <FotoInput
                  titulo="Equipamento / carregamento"
                  arquivo={foto}
                  onChange={setFoto}
                />
              </div>
            </section>

            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">5. Origem e destino</h2>
              <div className="space-y-3">
                <div>
                  <label className="field-label">Origem</label>
                  <select
                    className="field-input"
                    value={form.origem}
                    onChange={(e) => set("origem", e.target.value)}
                  >
                    {ORIGENS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
                {form.origem === "Outro..." && (
                  <input
                    className="field-input"
                    value={form.origemOutro}
                    onChange={(e) => set("origemOutro", e.target.value)}
                    placeholder="Descreva a origem (cidade / UF)"
                  />
                )}
                <div>
                  <label className="field-label">Destino — nome da obra</label>
                  <input
                    className="field-input"
                    value={form.destinoObra}
                    onChange={(e) => set("destinoObra", e.target.value)}
                    placeholder="Ex.: Obra Porto de Suape"
                  />
                </div>
                <div>
                  <label className="field-label">Endereço / cidade</label>
                  <input
                    className="field-input"
                    value={form.destinoEndereco}
                    onChange={(e) => set("destinoEndereco", e.target.value)}
                    placeholder="Rua, nº — Cidade/UF"
                  />
                </div>
              </div>
            </section>

            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">6. Motorista e veículo</h2>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Nome do motorista</label>
                    <input
                      className="field-input"
                      value={form.motoristaNome}
                      onChange={(e) => set("motoristaNome", e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div>
                    <label className="field-label">CPF</label>
                    <input
                      className="field-input"
                      inputMode="numeric"
                      value={form.motoristaCpf}
                      onChange={(e) => set("motoristaCpf", e.target.value)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Placa cavalo</label>
                    <input
                      className="field-input uppercase"
                      value={form.placaCavalo}
                      onChange={(e) => set("placaCavalo", e.target.value.toUpperCase())}
                      placeholder="ABC1D23"
                    />
                  </div>
                  <div>
                    <label className="field-label">Placa carreta</label>
                    <input
                      className="field-input uppercase"
                      value={form.placaCarreta}
                      onChange={(e) => set("placaCarreta", e.target.value.toUpperCase())}
                      placeholder="XYZ4E56"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold uppercase">7. Carga</h2>
                <span className="text-sm font-semibold text-primary">{moeda(total)}</span>
              </div>
              <div className="space-y-3">
                {form.itens.map((item, n) => (
                  <div key={item.id} className="rounded-lg border border-border bg-muted p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-muted-foreground">
                        Item {n + 1}
                      </span>
                      {form.itens.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              itens: f.itens.filter((i) => i.id !== item.id),
                            }))
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-destructive"
                        >
                          <Trash2 className="size-4" /> Remover
                        </button>
                      )}
                    </div>
                    <input
                      className="field-input mb-2"
                      value={item.descricao}
                      onChange={(e) => atualizarItem(item.id, "descricao", e.target.value)}
                      placeholder="Ex.: COMPLEMENTO DA FUWA GG09"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="field-label">Qtd.</label>
                        <input
                          className="field-input"
                          inputMode="decimal"
                          value={item.quantidade}
                          onChange={(e) => atualizarItem(item.id, "quantidade", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">
                          Peso (kg){exigePeso ? " *" : ""}
                        </label>
                        <input
                          className={`field-input ${
                            itemSemPeso(item) ? "border-destructive ring-2 ring-destructive/25" : ""
                          }`}
                          inputMode="decimal"
                          required={exigePeso}
                          aria-invalid={itemSemPeso(item)}
                          value={item.peso}
                          onChange={(e) => atualizarItem(item.id, "peso", e.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="field-label">Valor unit. R$</label>
                        <input
                          className="field-input"
                          inputMode="decimal"
                          value={item.valor}
                          onChange={(e) => atualizarItem(item.id, "valor", e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, novoItem()] }))}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 py-3 text-sm font-bold uppercase text-primary"
                >
                  <Plus className="size-4" /> Adicionar item
                </button>
              </div>
            </section>

            <section className="panel">
              <h2 className="mb-3 text-base font-bold uppercase">8. Totais e observações</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Peso bruto (kg)</label>
                  <input
                    className="field-input"
                    inputMode="numeric"
                    value={form.pesoBruto}
                    onChange={(e) => set("pesoBruto", e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Volumes</label>
                  <input
                    className="field-input"
                    inputMode="numeric"
                    value={form.volumes}
                    onChange={(e) => set("volumes", e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="field-label">Observações</label>
                <textarea
                  className="field-input min-h-24"
                  value={form.observacoes}
                  onChange={(e) => set("observacoes", e.target.value)}
                  placeholder="Informações extras para o setor fiscal"
                />
              </div>
            </section>

            {erro && (
              <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                {erro}
              </p>
            )}
          </>
        )}

        {etapa === "espelho" && (
          <section className="panel">
            <h2 className="mb-1 text-lg font-bold uppercase">{tituloDocumento(form)}</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              {form.documento === "Romaneio"
                ? "Confira, gere o PDF do romaneio e envie ao responsável."
                : "Confira e copie para o WhatsApp do setor fiscal."}
            </p>
            <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-[13px] leading-relaxed text-foreground">
              {espelho}
            </pre>
            <button
              onClick={() => void copiarEspelho()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-steel py-4 text-sm font-bold uppercase text-primary-foreground"
            >
              {copiado ? <Check className="size-5" /> : <ClipboardCopy className="size-5" />}
              {copiado ? "Copiado!" : "Copiar para WhatsApp"}
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => baixarPdf(form, protocolo)}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary py-4 text-sm font-bold uppercase text-primary-foreground"
              >
                <FileText className="size-5" /> Gerar PDF
              </button>
              <button
                onClick={() => void compartilharPdf(form, protocolo)}
                className="flex items-center justify-center gap-2 rounded-lg border-2 border-primary py-4 text-sm font-bold uppercase text-primary"
              >
                <Share2 className="size-5" /> Compartilhar
              </button>
            </div>
            {erro && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                {erro}
              </p>
            )}
          </section>
        )}

        {etapa === "sucesso" && (
          <section className="panel text-center">
            <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-success/15">
              <Check className="size-9 text-success" />
            </div>
            <h2 className="text-xl font-bold uppercase">Pedido registrado</h2>
            <p className="mt-1 text-sm text-muted-foreground">Protocolo</p>
            <p className="mt-1 font-mono text-lg font-bold text-primary">{protocolo || "—"}</p>
            <button
              onClick={() => void copiarEspelho()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-steel py-4 text-sm font-bold uppercase text-primary-foreground"
            >
              {copiado ? <Check className="size-5" /> : <ClipboardCopy className="size-5" />}
              {copiado ? "Copiado!" : "Copiar texto"}
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => baixarPdf(form, protocolo)}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary py-4 text-sm font-bold uppercase text-primary-foreground"
              >
                <FileText className="size-5" /> Gerar PDF
              </button>
              <button
                onClick={() => void compartilharPdf(form, protocolo)}
                className="flex items-center justify-center gap-2 rounded-lg border-2 border-primary py-4 text-sm font-bold uppercase text-primary"
              >
                <Share2 className="size-5" /> Compartilhar
              </button>
            </div>
            <button
              onClick={recomecar}
              className="mt-2 w-full rounded-lg border-2 border-primary py-4 text-sm font-bold uppercase text-primary"
            >
              Nova pré-emissão
            </button>
          </section>
        )}
      </main>

      {etapa !== "sucesso" && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            {etapa === "espelho" && (
              <button
                onClick={() => setEtapa("form")}
                className="rounded-lg border-2 border-border px-5 py-4 text-sm font-bold uppercase text-foreground"
              >
                Voltar
              </button>
            )}
            <button
              onClick={etapa === "form" ? irParaEspelho : () => void enviar()}
              disabled={enviando}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-4 text-base font-bold uppercase text-accent-foreground disabled:opacity-60"
            >
              {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
              {etapa === "form" ? "Revisar espelho" : "Enviar ao fiscal"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function FotoInput({
  titulo,
  arquivo,
  onChange,
  obrigatorio,
}: {
  titulo: string;
  arquivo: File | null;
  onChange: (f: File | null) => void;
  obrigatorio?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors ${
        arquivo ? "border-success bg-success/10" : "border-border bg-muted"
      }`}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        {arquivo ? <Check className="size-5" /> : <Camera className="size-5" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {titulo}
          {obrigatorio ? "" : " (opcional)"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {arquivo ? arquivo.name : "Tocar para tirar foto ou anexar"}
        </p>
      </div>
      <input
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
