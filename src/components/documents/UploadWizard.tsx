import { useState, useRef, useEffect } from "react";
import { ShieldCheck, Layers, Calendar, AlertCircle, Upload, Check, Loader2, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClarityReport, ClarityReportData } from "./ClarityReport";

export type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

export interface UploadStatus {
  state: UploadState;
  message?: string;
  fileName?: string;
  /** Upload progress 0-100 (only during 'uploading' state) */
  progress?: number;
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
  const [docCategory, setDocCategory] = useState<"ISMS_CORE" | "B2B_GEHC" | "B2B_DIRECT" | "OPERATIONAL">("ISMS_CORE");
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
      message: "Validating document quality and clarity..." 
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
            message: validateResult.error || "Failed to validate document clarity.",
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

      // Step 2: Upload and Index (with progress tracking)
      setUploadStatus({ 
        state: "uploading", 
        fileName: selectedFile.name, 
        message: "Uploading document...",
        progress: 0,
      });

      const result = await new Promise<{ success: boolean; error?: string; data?: { id: string; chunkCount?: number } }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadStatus(prev => ({ ...prev, progress: pct, message: pct < 100 ? `Uploading... ${pct}%` : 'Processing embeddings...' }));
          }
        };
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid response')); }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('POST', '/api/documents/upload');
        xhr.send(formData);
      });

      setUploadStatus({ 
        state: "processing", 
        fileName: selectedFile.name, 
        message: "Generating pgvector embeddings...",
        progress: 100,
      });

      if (!result.success) {
        setUploadStatus({
          state: "error",
          fileName: selectedFile.name,
          message: result.error || "Failed to upload file.",
        });
        return;
      }

      setUploadStatus({
        state: "done",
        fileName: selectedFile.name,
        message: `${result.data?.chunkCount ?? 0} chunks successfully indexed in RAG database!`,
      });

      onSuccess();

      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (err) {
      setUploadStatus({
        state: "error",
        fileName: selectedFile.name,
        message: err instanceof Error ? err.message : "Unexpected error during upload.",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.csv"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Select evidence file"
      />
      <div className="glass-card w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">ISMS Guideline Indexing</h3>
              <p className="text-[10px] text-text-muted">Safety Gate: Required metadata to prevent RAG errors.</p>
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
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 1 ? "bg-primary text-white" : "bg-white/5 text-slate-500"}`}>1</span>
            <span className={wizardStep >= 1 ? "text-primary font-semibold" : "text-slate-500"}>Scope</span>
            <div className={`h-px w-8 bg-white/10 ${wizardStep >= 2 ? "bg-primary/40" : ""}`} />
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 2 ? "bg-primary text-white" : "bg-white/5 text-slate-500"}`}>2</span>
            <span className={wizardStep >= 2 ? "text-primary font-semibold" : "text-slate-500"}>Expiration</span>
            <div className={`h-px w-8 bg-white/10 ${wizardStep >= 3 ? "bg-primary/40" : ""}`} />
            <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 3 ? "bg-primary text-white" : "bg-white/5 text-slate-500"}`}>3</span>
            <span className={wizardStep >= 3 ? "text-primary font-semibold" : "text-slate-500"}>Upload</span>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: Scope */}
          {wizardStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Document Classification</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-primary/50 dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary"
                >
                  <option value="ISMS_CORE" className="bg-[#1e293b]">ISMS Core (Organization Policies)</option>
                  <option value="B2B_GEHC" className="bg-[#1e293b]">B2B Channel — GEHC (Privacy: GEHC as Data Controller)</option>
                  <option value="B2B_DIRECT" className="bg-[#1e293b]">B2B Channel — Direct Sales (Privacy: Ionic as Data Controller)</option>
                  <option value="OPERATIONAL" className="bg-[#1e293b]">Operational (Daily Technical Procedures)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Application Scope</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDocScope("global")}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                      docScope === "global"
                        ? "bg-primary/10 border-primary text-white"
                        : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                    }`}
                  >
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-xs">Global ISMS</span>
                    <span className="text-[9px] text-text-muted">Applies to the entire organization</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDocScope("version")}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                      docScope === "version"
                        ? "bg-primary/10 border-primary text-white"
                        : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                    }`}
                  >
                    <Layers className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-xs">Technical Specification</span>
                    <span className="text-[9px] text-text-muted">Restricted to product version</span>
                  </button>
                </div>
              </div>

              {docScope === "version" && (
                <div className="space-y-1.5 pt-1 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Target Version (nCommand Lite)</label>
                  <select
                    value={targetVersionId}
                    onChange={(e) => setTargetVersionId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-primary/50 dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#1e293b]">
                        {v.product_name} {v.version_code}
                      </option>
                    ))}
                  </select>
                  <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-xs text-primary flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      <strong>Attention:</strong> Specific documents are isolated in RAG. Chat AI will use this data only to audit the selected version.
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
                  <label htmlFor="doc-version" className="text-xs font-bold uppercase tracking-wider text-slate-400">Document Version</label>
                  <input
                    id="doc-version"
                    type="text"
                    placeholder="Ex: 1.0 or 2.1"
                    value={docVersion}
                    onChange={(e) => setDocVersion(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-primary/50 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="doc-status" className="text-xs font-bold uppercase tracking-wider text-slate-400">Publication Status</label>
                  <select
                    id="doc-status"
                    value={docStatus}
                    onChange={(e) => setDocStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-primary/50 dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary"
                  >
                    <option value="published" className="bg-[#1e293b]">Active (Published to RAG)</option>
                    <option value="draft" className="bg-[#1e293b]">Draft (Does not index in RAG)</option>
                    <option value="superseded" className="bg-[#1e293b]">Superseded (Historical)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="doc-expires" className="text-xs font-bold uppercase tracking-wider text-slate-400">Expiration/Annual Review Date</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Calendar className="h-4 w-4 text-text-muted" />
                  </div>
                  <input
                    id="doc-expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white outline-none focus:border-primary/50"
                  />
                </div>
                <p className="text-[10px] text-text-muted mt-1">The system will send automatic alerts to the dashboard on the set date.</p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-xs text-amber-400 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Lifecycle Note:</strong> If you are updating an old policy, be sure to mark the previous one as <strong>Superseded</strong> in the listing so that AI does not read conflicting guidelines.
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
                        <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Metadata Review</h4>
                        <div className="grid grid-cols-2 gap-2 text-slate-300">
                          <div><span className="text-text-muted">Category:</span> {docCategory}</div>
                          <div><span className="text-text-muted">Version:</span> v{docVersion}</div>
                          <div>
                            <span className="text-text-muted">Scope:</span>{" "}
                            {docScope === "global" ? "Global Organizational" : "Version Specific"}
                          </div>
                          {docScope === "version" && (
                            <div>
                              <span className="text-text-muted">nCommand Lite:</span>{" "}
                              {versions.find((v) => v.id === targetVersionId)?.version_code}
                            </div>
                          )}
                          <div>
                            <span className="text-text-muted">Expiration:</span>{" "}
                            {expiresAt ? formatDate(expiresAt) : "No expiration"}
                          </div>
                          <div>
                            <span className="text-text-muted">RAG Status:</span>{" "}
                            {docStatus === "published" ? "Published / Active" : "Do not index"}
                          </div>
                        </div>
                      </div>

                      {/* Dropzone */}
                      <div
                        onClick={handleFileSelectClick}
                        className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-primary/50 rounded-2xl p-8 cursor-pointer transition-all bg-white/[0.01] hover:bg-white/[0.02] text-center"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-3">
                          <Upload className="h-6 w-6 text-primary" />
                        </div>
                        {selectedFile ? (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white truncate max-w-[300px]">
                              {selectedFile.name}
                            </p>
                            <p className="text-xs text-text-muted">
                              {formatFileSize(selectedFile.size)} • Ready to index
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">Select document</p>
                            <p className="text-xs text-text-muted">PDF, DOCX, TXT, MD, CSV (Max 20MB)</p>
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
                      <div className="space-y-2 flex-1">
                        <p className="text-sm font-semibold text-white">{uploadStatus.message || "Uploading file..."}</p>
                        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadStatus.progress ?? 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-text-muted">{uploadStatus.progress ?? 0}% • {selectedFile?.name}</p>
                      </div>
                    </>
                  )}
                  {uploadStatus.state === "processing" && (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Processing document...</p>
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
                        <p className="text-sm font-semibold text-white">Indexing Complete!</p>
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
                        <p className="text-sm font-semibold text-red-400">Indexing Failed</p>
                        <p className="text-xs text-text-muted">{uploadStatus.message}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between bg-white/[0.01]">
          <div>
            {wizardStep > 1 && uploadStatus.state === "idle" && (
              <Button
                variant="ghost"
                size="sm"
                icon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => setWizardStep((prev) => prev - 1)}
              >
                Back
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
              Cancel
            </Button>
            
            {wizardStep < 3 && (
              <Button
                variant="primary"
                onClick={() => setWizardStep((prev) => prev + 1)}
              >
                Next
              </Button>
            )}

            {wizardStep === 3 && uploadStatus.state === "idle" && (
              clarityReport ? (
                <Button
                  variant="secondary"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50"
                  onClick={() => handleUpload(true)}
                >
                  Force Indexing
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => handleUpload(false)}
                  disabled={!selectedFile}
                >
                  Start Indexing
                </Button>
              )
            )}

            {uploadStatus.state === "error" && (
              <Button
                variant="primary"
                onClick={() => setUploadStatus({ state: "idle" })}
              >
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
