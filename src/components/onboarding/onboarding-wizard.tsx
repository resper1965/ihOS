"use client";

import { useState } from "react";
import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Steps definition
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "welcome",
    title: "Bem-vindo ao ihOS",
    subtitle: "Inteligência de compliance para a Ionic Health",
    icon: Sparkles,
    iconColor: "text-blue-400",
    iconBg: "from-blue-500/20 to-emerald-500/20",
    description:
      "O ihOS é o sistema central de governança, risco e compliance da Ionic Health. Em poucos passos você estará monitorando frameworks como LGPD, ISO 27001, TX-RAMP e muito mais.",
    action: null,
  },
  {
    id: "framework",
    title: "Escolha seus Frameworks",
    subtitle: "Passo 1 de 4",
    icon: ShieldCheck,
    iconColor: "text-emerald-400",
    iconBg: "from-emerald-500/20 to-cyan-500/20",
    description:
      "Acesse a página de Compliance para visualizar o scorecard dos frameworks disponíveis. O sistema já monitora LGPD, HIPAA, ISO 27001, TX-RAMP e EU GDPR automaticamente.",
    action: { label: "Ver Compliance", href: "/compliance" },
  },
  {
    id: "documents",
    title: "Carregue seus Documentos",
    subtitle: "Passo 2 de 4",
    icon: FileText,
    iconColor: "text-cyan-400",
    iconBg: "from-cyan-500/20 to-blue-500/20",
    description:
      "Envie políticas, procedimentos e evidências do SGSI. O sistema vai indexar automaticamente e tornar esses documentos disponíveis para consulta via IA e avaliações de conformidade.",
    action: { label: "Ir para Documentos", href: "/documents" },
  },
  {
    id: "assessment",
    title: "Crie sua Primeira Avaliação",
    subtitle: "Passo 3 de 4",
    icon: ClipboardCheck,
    iconColor: "text-amber-400",
    iconBg: "from-amber-500/20 to-orange-500/20",
    description:
      "Avaliações de conformidade registram o progresso contra cada controle de um framework. Você pode importar respostas via planilha ou preencher manualmente.",
    action: { label: "Ver Avaliações", href: "/assessments" },
  },
  {
    id: "chat",
    title: "Converse com o Assistente IA",
    subtitle: "Passo 4 de 4",
    icon: MessageSquare,
    iconColor: "text-violet-400",
    iconBg: "from-violet-500/20 to-purple-500/20",
    description:
      "O assistente IA do ihOS analisa seus documentos, avaliações e dados de compliance em tempo real. Pergunte sobre gaps, scores ou peça um resumo executivo.",
    action: { label: "Abrir Chat", href: "/chat" },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: () => Promise<void>;
  onDismiss: () => void;
}

export function OnboardingWizard({ onComplete, onDismiss }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  const current = STEPS[step];
  const Icon = current.icon;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const handleComplete = async () => {
    setCompleting(true);
    await onComplete();
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl shadow-black/40">
        {/* Close */}
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="px-8 pb-8 pt-8">
          {/* Icon */}
          <div
            className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${current.iconBg}`}
          >
            <Icon className={`h-7 w-7 ${current.iconColor}`} />
          </div>

          {/* Step indicator */}
          {!isFirst && (
            <p className="mb-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {current.subtitle}
            </p>
          )}

          <h2 className="mb-3 text-xl font-bold text-white">{current.title}</h2>
          <p className="mb-8 text-sm leading-relaxed text-slate-400">{current.description}</p>

          {/* Step dots */}
          <div className="mb-8 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-6 bg-blue-400"
                    : i < step
                    ? "w-2 bg-emerald-500"
                    : "w-2 bg-white/10"
                }`}
                aria-label={`Ir para passo ${i + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            )}

            {current.action && (
              <Link
                href={current.action.href}
                className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all"
                onClick={onDismiss}
              >
                {current.action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            <button
              onClick={isLast ? handleComplete : () => setStep((s) => s + 1)}
              disabled={completing}
              className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-400 hover:to-emerald-400 transition-all disabled:opacity-60"
            >
              {completing ? (
                "Concluindo..."
              ) : isLast ? (
                <>
                  <Check className="h-4 w-4" /> Concluir
                </>
              ) : (
                <>
                  Próximo <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
