import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Card } from "@/components/ui/card";
import { Database, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function KnowledgeBasePage() {
  const supabase = await createClient();

  const { count: totalDocs } = await supabase
    .from("compliance_documents")
    .select("*", { count: "exact", head: true });

  const { count: totalChunks } = await supabase
    .from("document_chunks")
    .select("*", { count: "exact", head: true });

  const { count: missingIndexDocs } = await supabase
    .from("compliance_documents")
    .select("*", { count: "exact", head: true })
    .eq("total_chunks", 0);

  // Approximate ISO coverage by counting chunks that have iso_controls
  const { data: chunksWithIso } = await supabase
    .from("document_chunks")
    .select("id")
    .not("iso_controls", "is", null);
    
  const isoCoverageCount = chunksWithIso?.length || 0;
  const isoPercentage = totalChunks && totalChunks > 0 
    ? Math.round((isoCoverageCount / totalChunks) * 100) 
    : 0;

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="Knowledge Base Health"
        subtitle="Métricas de indexação e cobertura ISO-27001 do RAG"
        icon={<Database className="h-4 w-4 text-emerald-400" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Documentos Ingeridos" icon={<Database className="h-5 w-5 text-blue-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalDocs || 0}</span>
          </div>
        </Card>

        <Card title="Chunks Vetorizados" icon={<Activity className="h-5 w-5 text-purple-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalChunks || 0}</span>
          </div>
        </Card>

        <Card title="Falhas de Indexação" icon={<AlertTriangle className="h-5 w-5 text-red-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{missingIndexDocs || 0}</span>
            <p className="text-xs text-text-muted mt-1">Docs sem chunks processados.</p>
          </div>
        </Card>

        <Card title="Cobertura ISO-27001" icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{isoPercentage}%</span>
            <p className="text-xs text-text-muted mt-1">Chunks com controles ISO ({isoCoverageCount}).</p>
          </div>
        </Card>
      </div>

    </div>
  );
}
