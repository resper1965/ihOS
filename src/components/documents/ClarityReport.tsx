import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface ClarityIssue {
  severity: string;
  code: string;
  location: string;
  message: string;
  fix: string;
}

export interface ClarityReportData {
  clarityStatus: "UNCLEAR" | "CLEAR";
  issues: ClarityIssue[];
}

interface ClarityReportProps {
  report: ClarityReportData;
}

export function ClarityReport({ report }: ClarityReportProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex gap-3">
        <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-left">
          <h4 className="font-bold text-red-400 text-sm">Alerta do Clarity Gate</h4>
          <p className="text-xs text-slate-300 mt-1">
            O documento possui problemas de qualidade epistêmica ou alegações não comprovadas. Recomendamos corrigi-los antes de indexar.
          </p>
        </div>
      </div>

      <div className="max-h-[250px] overflow-y-auto divide-y divide-white/5 space-y-3 pr-2">
        {report.issues.map((issue, index) => (
          <div key={index} className="pt-3 first:pt-0 space-y-1 text-left">
            <div className="flex items-center justify-between">
              <Badge variant="danger" className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20">
                {issue.severity} • {issue.code}
              </Badge>
              <span className="text-[10px] text-slate-500 font-mono">{issue.location}</span>
            </div>
            <p className="text-xs text-text-primary font-medium">{issue.message}</p>
            <p className="text-[11px] text-emerald-400 bg-emerald-500/5 rounded p-1.5 border border-emerald-500/10">
              <strong>Sugestão:</strong> {issue.fix}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
