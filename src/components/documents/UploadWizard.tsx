import { useState, useRef, useEffect } from "react";
import { ShieldCheck, Layers, Calendar, AlertCircle, Upload, Check, Loader2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClarityReport, ClarityReportData } from "./ClarityReport";

export type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

export interface UploadStatus {
  state: UploadState;
  message?: string;
  fileName?: string;
}

interface UploadWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  versions: any[];
  activeVersion: any | null;
}

export function UploadWizard({ isOpen, onClose, onSuccess, versions, activeVersion }: UploadWizardProps) {
  const [wizardStep, setWizardStep] = useState(1);
  const [docCategory, setDocCategory] = useState<"ISMS_CORE" | "B2B_GEHC" | "OPERATIONAL">("ISMS_CORE");
  const [docScope, setDocScope] = useState<"global" | "version">("global");
  const [targetVersionId, setTargetVersionId] = useState<string>("");
  const [docVersion, setDocVersion] = useState("1.0");
  const [docStatus, setDocStatus] = useState<"draft" | "published" | "superseded" | "expired">("published");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clarityReport, setClarityReport] = useState<ClarityReportData | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ state: "idle" });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set default target version
  useEffect(() => {
    if (versions.length > 0 && !targetVersionId) {
      setTargetVersionId(activeVersion?.id || versions[0].id);
    }
  }, [versions, activeVersion, targetVersionId]);

  // Reset function
  const resetWizard = () => {
    setWizardStep(1);
    setDocCategory("ISMS_CORE");
    setDocScope("global");
    setDocVersion("1.0");
    setDocStatus("published");
    setExpiresAt("");
    setSelectedFile(null);
    setUploadStatus({ state: "idle" });
    setClarityReport(null);
  };

  // Close with reset
  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const handleFileSelectClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  };

  const handleUpload = async (force = false) => {
    if (!selectedFile) return;

    setClarityReport(null);
    setUploadStatus({ 
      state: "processing", 
      fileName: selectedFile.name, 
      message: "Validando qualidade e clareza do documento..." 
    });
    setWizardStep(3);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", docCategory);
      formData.append("version", docVersion);
      formData.append("status", docStatus);
      
      if (docScope === "version" && targetVersionId) {
        formData.append("productVersionId", targetVersionId);
      }
      
      if (expiresAt) {
        formData.append("expiresAt", new Date(expiresAt).toISOString());
      }

      if (force) {
        formData.append("forceIndex", "true");
      }

      // Step 1: Clarity Validation
      if (!force) {
        const validateRes = await fetch("/api/documents/validate-clarity", {
          method: "POST",
          body: formData,
        });
        const validateResult = await validateRes.json();
        
        if (!validateRes.ok || !validateResult.success) {
          setUploadStatus({
            state: "error",
            fileName: selectedFile.name,
            message: validateResult.error || "Falha ao validar clareza do documento.",
          });
          return;
        }

        const report = validateResult.data;
        if (report.clarityStatus === "UNCLEAR") {
          setClarityReport(report);
          setUploadStatus({ state: "idle" });
          return;
        }
      }

      // Step 2: Upload and Index
      setUploadStatus({ 
        state: "processing", 
        fileName: selectedFile.name, 
        message: "Clarity Gate aprovado. Extraindo texto e gerando embeddings pgvector..." 
      });

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setUploadStatus({
          state: "error",
          fileName: selectedFile.name,
          message: result.error || "Falha no upload do arquivo.",
        });
        return;
      }

      setUploadStatus({
        state: "done",
        fileName: selectedFile.name,
        message: `${result.data.chunkCount} chunks indexados com sucesso no banco RAG!`,
      });

      onSuccess();

      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (err) {
      setUploadStatus({
        state: "error",
        fileName: selectedFile.name,
        message: err instanceof Error ? err.message : "Erro inesperado no upload.",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Selecionar arquivo de evidência"
      />
      <div className="glass-card w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Indexação de Diretriz do SGSI</h3>
              <p className="text-[10px] text-text-muted">Safety Gate: Metadados obrigatórios para evitar erros de RAG.</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center border-b border-white/5 px-6 py-3 bg-white/[0.01]">
          <div className="flex items-center gap-2 text-xs">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 1 ? "bg-blue-500 text-white" : "bg-white/5 text-slate-500"}`}>1</span>
            <span className={wizardStep >= 1 ? "text-blue-400 font-semibold" : "text-slate-500"}>Escopo</span>
            <div className={`h-px w-8 bg-white/10 ${wizardStep >= 2 ? "bg-blue-500/40" : ""}`} />
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 2 ? "bg-blue-500 text-white" : "bg-white/5 text-slate-500"}`}>2</span>
            <span className={wizardStep >= 2 ? "text-blue-400 font-semibold" : "text-slate-500"}>Validade</span>
            <div className={`h-px w-8 bg-white/10 ${wizardStep >= 3 ? "bg-blue-500/40" : ""}`} />
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 3 ? "bg-blue-500 text-white" : "bg-white/5 text-slate-500"}`}>3</span>
            <span className={wizardStep >= 3 ? "text-blue-400 font-semibold" : "text-slate-500"}>Upload</span>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: Scope */}
          {wizardStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Classificação do Documento</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                >
                  <option value="ISMS_CORE" className="bg-[#1e293b]">ISMS Core (Políticas de Organização)</option>
                  <option value="B2B_GEHC" className="bg-[#1e293b]">B2B Overlay (Auditorias de Clientes - ex: GEHC)</option>
                  <option value="OPERATIONAL" className="bg-[#1e293b]">Operational (Procedimentos Técnicos Diários)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Escopo de Aplicação</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDocScope("global")}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                      docScope === "global"
                        ? "bg-blue-500/10 border-blue-500 text-white"
                        : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                    }`}
                  >
                    <ShieldCheck className="h-5 w-5 text-blue-400" />
                    <span className="font-semibold text-xs">SGSI Geral</span>
                    <span className="text-[9px] text-text-muted">Aplica-se a toda organização</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDocScope("version")}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                      docScope === "version"
                        ? "bg-blue-500/10 border-blue-500 text-white"
                        : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                    }`}
                  >
                    <Layers className="h-5 w-5 text-blue-400" />
                    <span className="font-semibold text-xs">Especificação Técnica</span>
                    <span className="text-[9px] text-text-muted">Restrito à versão do produto</span>
                  </button>
                </div>
              </div>

              {docScope === "version" && (
                <div className="space-y-1.5 pt-1 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Versão Alvo (nCommand Lite)</label>
                  <select
                    value={targetVersionId}
                    onChange={(e) => setTargetVersionId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#1e293b]">
                        {v.product_name} {v.version_code}
                      </option>
                    ))}
                  </select>
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 text-xs text-blue-400 flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      <strong>Atenção:</strong> Documentos específicos são isolados no RAG. O chat de IA usará estes dados apenas para auditar a versão selecionada.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Expiration and Lifecycle */}
          {wizardStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="doc-version" className="text-xs font-bold uppercase tracking-wider text-slate-400">Versão do Documento</label>
                  <input
                    id="doc-version"
                    type="text"
                    placeholder="Ex: 1.0 ou 2.1"
                    value={docVersion}
                    onChange={(e) => setDocVersion(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="doc-status" className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado de Publicação</label>
                  <select
                    id="doc-status"
                    value={docStatus}
                    onChange={(e) => setDocStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                  >
                    <option value="published" className="bg-[#1e293b]">Ativo (Publicado no RAG)</option>
                    <option value="draft" className="bg-[#1e293b]">Rascunho (Não indexa no RAG)</option>
                    <option value="superseded" className="bg-[#1e293b]">Substituído (Histórico)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="doc-expires" className="text-xs font-bold uppercase tracking-wider text-slate-400">Data de Expiração/Revisão Anual</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Calendar className="h-4 w-4 text-text-muted" />
                  </div>
                  <input
                    id="doc-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </div>
                <p className="text-[10px] text-text-muted mt-1">O sistema enviará alertas automáticos no dashboard na data definida.</p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-xs text-amber-400 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Nota de Ciclo de Vida:</strong> Se você estiver atualizando uma política antiga, certifique-se de marcar a anterior como <strong>Substituída (Superseded)</strong> na listagem para que a IA não leia diretrizes em conflito.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: File Upload & Progress */}
          {wizardStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {uploadStatus.state === "idle" ? (
                <div className="space-y-4">
                  {clarityReport ? (
                    <ClarityReport report={clarityReport} />
                  ) : (
                    <>
                      {/* Configuration Review Table */}
                      <div className="rounded-xl bg-white/5 border border-white/5 p-4 text-xs space-y-2">
                        <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Revisão dos Metadados</h4>
                        <div className="grid grid-cols-2 gap-2 text-slate-300">
                          <div><span className="text-text-muted">Categoria:</span> {docCategory}</div>
                          <div><span className="text-text-muted">Versão:</span> v{docVersion}</div>
                          <div>
                            <span className="text-text-muted">Escopo:</span>{" "}
                            {docScope === "global" ? "Organizacional Global" : "Específico de Versão"}
                          </div>
                          {docScope === "version" && (
                            <div>
                              <span className="text-text-muted">nCommand Lite:</span>{" "}
                              {versions.find((v) => v.id === targetVersionId)?.version_code}
                            </div>
                          )}
                          <div>
                            <span className="text-text-muted">Validade:</span>{" "}
                            {expiresAt ? formatDate(expiresAt) : "Sem expiração"}
                          </div>
                          <div>
                            <span className="text-text-muted">Status RAG:</span>{" "}
                            {docStatus === "published" ? "Publicado / Ativo" : "Não indexar"}
                          </div>
                        </div>
                      </div>

                      {/* Dropzone */}
                      <div
                        onClick={handleFileSelectClick}
                        className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-blue-500/50 rounded-2xl p-8 cursor-pointer transition-all bg-white/[0.01] hover:bg-white/[0.02] text-center"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 mb-3">
                          <Upload className="h-6 w-6 text-blue-400" />
                        </div>
                        {selectedFile ? (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white truncate max-w-[300px]">
                              {selectedFile.name}
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatFileSize(selectedFile.size)} • Pronto para indexar
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">Selecionar documento</p>
                            <p className="text-xs text-text-muted">PDF, TXT, MD, CSV (Max 20MB)</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* In progress animation block */
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                  {uploadStatus.state === "uploading" && (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Enviando arquivo...</p>
                        <p className="text-xs text-text-muted">Gravando metadados no Supabase Storage.</p>
                      </div>
                    </>
                  )}
                  {uploadStatus.state === "processing" && (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Processando documento...</p>
                        <p className="text-xs text-amber-400">{uploadStatus.message}</p>
                      </div>
                    </>
                  )}
                  {uploadStatus.state === "done" && (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                        <Check className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Indexação Concluída!</p>
                        <p className="text-xs text-emerald-400">{uploadStatus.message}</p>
                      </div>
                    </>
                  )}
                  {uploadStatus.state === "error" && (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                        <AlertCircle className="h-6 w-6 text-red-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-red-400">Falha na Indexação</p>
                        <p className="text-xs text-text-muted">{uploadStatus.message}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between bg-white/[0.01]">
          <div>
            {wizardStep > 1 && uploadStatus.state === "idle" && (
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => setWizardStep((prev) => prev - 1)}
              >
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={uploadStatus.state === "uploading" || uploadStatus.state === "processing"}
            >
              Cancelar
            </Button>
            
            {wizardStep < 3 && (
              <Button
                variant="primary"
                onClick={() => setWizardStep((prev) => prev + 1)}
              >
                Avançar
              </Button>
            )}

            {wizardStep === 3 && uploadStatus.state === "idle" && (
              clarityReport ? (
                <Button
                  variant="secondary"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50"
                  onClick={() => handleUpload(true)}
                >
                  Forçar Indexação
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => handleUpload(false)}
                  disabled={!selectedFile}
                >
                  Iniciar Indexação
                </Button>
              )
            )}

            {uploadStatus.state === "error" && (
              <Button
                variant="primary"
                onClick={() => setUploadStatus({ state: "idle" })}
              >
                Tentar Novamente
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
