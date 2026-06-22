"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FAQItem {
  question: string;
  answer: string;
}

export interface TourStep {
  targetId: string; // DOM element ID to highlight
  title: string;
  content: string;
}

export interface PageHelpData {
  title: string;
  subtitle: string;
  description: string;
  faqs: FAQItem[];
  tourSteps: TourStep[];
}

interface HelpContextType {
  isOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  tourActive: boolean;
  tourStep: number;
  startTour: () => void;
  stopTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  activeHelpData: PageHelpData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Help Content Database
// ─────────────────────────────────────────────────────────────────────────────

const HELP_DATABASE: Record<string, PageHelpData> = {
  "/": {
    title: "Painel de Controle (Dashboard)",
    subtitle: "Visão consolidada de governança e conformidade",
    description: "Este painel centraliza o estado geral da postura de conformidade regulatória e de segurança da sua organização.",
    faqs: [
      {
        question: "Como o Score de Conformidade é calculado?",
        answer: "Ele é a média aritmética das notas obtidas nas auditorias ativas dos frameworks selecionados."
      },
      {
        question: "O que indica o Feed de Atividades?",
        answer: "Mostra eventos recentes gerados automaticamente, como aproximação de prazos de metas, expiração de concessões de risco (POAM) ou queda de scores de conformidade."
      },
      {
        question: "De onde vêm os dados de postura de vulnerabilidade?",
        answer: "Eles são sincronizados diariamente às 3h da manhã da sua conta do DefectDojo. A barra de SLA exibe o prazo restante para correção com base nas severidades das CWEs encontradas."
      }
    ],
    tourSteps: [
      {
        targetId: "stats-grid-dashboard",
        title: "Indicadores Rápidos",
        content: "Aqui você vê os totais de frameworks monitorados, documentos carregados, auditorias ativas e a nota geral média."
      },
      {
        targetId: "vulnerability-posture-card",
        title: "Postura de Vulnerabilidades",
        content: "Métricas agregadas do DefectDojo. Acompanhe a conformidade do SLA de correção de acordo com as criticidades das falhas."
      },
      {
        targetId: "activity-feed-card",
        title: "Histórico de Atividades",
        content: "Registra alertas importantes do agente autônomo sobre vencimento de tarefas e mudanças nos scores."
      },
      {
        targetId: "goals-widget-card",
        title: "Acompanhamento de Remediação",
        content: "Visualize as metas ativas abertas para sanar lacunas identificadas e veja a evolução geral das tarefas."
      }
    ]
  },
  "/compliance": {
    title: "Inteligência de Conformidade",
    subtitle: "Análise profunda de postura e plano de ação ideal",
    description: "Espaço dedicado a detalhar o score de cada regulamento, analisar overlaps e priorizar as tarefas com maior retorno sobre o esforço (ROI).",
    faqs: [
      {
        question: "O que é a priorização de remediação baseada em ROI?",
        answer: "Nosso algoritmo mapeia os controles compartilhados entre regulamentos. Corrigir um controle que atende simultaneamente à ISO 27001 e à LGPD oferece maior retorno de investimento (ROI)."
      },
      {
        question: "Como funcionam os níveis de confiança do RAG nos Gaps?",
        answer: "Representa a certeza estatística da inteligência artificial de que a evidência de fato atende àquele controle, variando de 0 a 100%."
      }
    ],
    tourSteps: [
      {
        targetId: "compliance-scorecards",
        title: "Postura por Framework",
        content: "Compare o desempenho entre diferentes regulamentos. Cada card detalha a quantidade de controles atendidos e falhas abertas."
      },
      {
        targetId: "remediation-roi-card",
        title: "Remediação Prioritária (ROI)",
        content: "Siga esta lista para otimizar suas tarefas. Foca nas correções de controles com maior impacto regulatório integrado."
      },
      {
        targetId: "compliance-gaps-table",
        title: "Lista de Gaps Críticos",
        content: "Lista dos controles em estado de falha ou sem evidência documentada. Veja qual informação exata está em falta."
      }
    ]
  },
  "/compliance/mappings": {
    title: "Mapeamentos GRC",
    subtitle: "Conexão de controles locais com frameworks externos",
    description: "Exibe a relação direta dos controles do Secure Controls Framework (SCF) mapeados para regulamentações de mercado.",
    faqs: [
      {
        question: "O que acontece ao clicar em 'Sync with Standard GRC'?",
        answer: "A plataforma se conecta com a API Standard GRC para obter a atualização e tradução mais recente dos mapeamentos de controle para o SCF."
      },
      {
        question: "Posso carregar mapeamentos manuais?",
        answer: "Sim, usando a ferramenta de upload é possível submeter planilhas customizadas que correlacionam controles internos com novos frameworks."
      }
    ],
    tourSteps: [
      {
        targetId: "mappings-sync-button",
        title: "Sincronização",
        content: "Use este botão para garantir que suas definições de GRC estejam atualizadas conforme os padrões mais recentes do mercado."
      },
      {
        targetId: "mappings-search-input",
        title: "Filtro de Busca",
        content: "Busque mapeamentos específicos por palavra-chave, código de controle local ou identificador do framework alvo."
      }
    ]
  },
  "/documents": {
    title: "Gerenciador de Documentos & Ingestão",
    subtitle: "Submissão de políticas, evidências e classificação",
    description: "Central para envio e acompanhamento dos documentos corporativos que alimentam a base RAG.",
    faqs: [
      {
        question: "O que é o Clarity Gate?",
        answer: "É um validador baseado em IA que analisa a clareza e precisão do texto inserido, garantindo que não contenha contradições ou termos excessivamente vagos antes de indexá-lo."
      },
      {
        question: "O que significa 'PENDING_HITL'?",
        answer: "Significa 'Human-in-the-Loop pendente'. Ocorre quando um documento é marcado como ambíguo ou quando há falha no validador. Exige aprovação de um auditor para entrar na base de conhecimento."
      }
    ],
    tourSteps: [
      {
        targetId: "document-upload-btn",
        title: "Novo Documento",
        content: "Inicie o assistente para carregar um novo arquivo, selecionar o escopo (Global ou específico de produto) e sua categoria correspondente."
      },
      {
        targetId: "document-filter-tabs",
        title: "Filtros de Visualização",
        content: "Classifique seus documentos por escopo: políticas organizacionais gerais, especificações do produto nCommand ou contratos de canais."
      },
      {
        targetId: "document-list-table",
        title: "Tabela de Documentos",
        content: "Verifique o status do Clarity Gate de cada arquivo. Arquivos rejeitados ou não validados não entram no RAG até aprovação."
      }
    ]
  },
  "/assessments": {
    title: "Auditorias & Avaliações",
    subtitle: "Execução de auditorias automatizadas e planos de ação (POAM)",
    description: "Aqui você executa e analisa relatórios de auditoria, além de gerenciar itens de POAM com aceitação temporária de riscos.",
    faqs: [
      {
        question: "Qual a diferença entre os modos Quick e Deep?",
        answer: "O Quick avalia rapidamente as correspondências de RAG textuais. O Deep executa análises com agentes de IA para verificar evidências em arquivos específicos, buscando provas reais."
      },
      {
        question: "Como funciona a expiração de riscos no POAM?",
        answer: "Um controle classificado como gap pode ter seu risco aceito temporariamente. Quando esse prazo vence, a aceitação expira e o sistema cria alertas automáticos."
      }
    ],
    tourSteps: [
      {
        targetId: "run-assessment-btn",
        title: "Iniciar Nova Auditoria",
        content: "Clique aqui para configurar e executar um escaneamento de conformidade em tempo real baseado em RAG."
      },
      {
        targetId: "assessments-history-list",
        title: "Histórico de Auditorias",
        content: "Visualize ciclos de avaliações passados, comparando o progresso de conformidade ao longo do tempo."
      }
    ]
  },
  "/goals": {
    title: "Projetos de Remediação & Metas",
    subtitle: "Acompanhamento de objetivos e autonomia do agente",
    description: "Monitore o progresso de resolução de lacunas de segurança através de metas subdivididas em tarefas técnicas.",
    faqs: [
      {
        question: "Por que algumas tarefas pedem autorização manual?",
        answer: "Devido aos limites de autonomia do agente. Ações mapeadas na zona amarela dependem do seu consentimento ('Confirmar') para prosseguir."
      },
      {
        question: "Como o progresso da meta é calculado?",
        answer: "É proporcional à taxa de conclusão das tarefas técnicas ligadas a ela."
      }
    ],
    tourSteps: [
      {
        targetId: "create-goal-btn",
        title: "Nova Meta de Remediação",
        content: "Crie um novo projeto associado a um framework para acompanhar as correções necessárias."
      },
      {
        targetId: "goals-accordion-list",
        title: "Lista de Projetos",
        content: "Expanda qualquer meta para visualizar as tarefas vinculadas, prazos e agentes designados."
      }
    ]
  },
  "/chat": {
    title: "Assistente de IA GRC",
    subtitle: "Conversação contextual com inteligência RAG",
    description: "Canal de conversação direta para tirar dúvidas de políticas da organização, solicitar análises ou submeter questionários de auditoria.",
    faqs: [
      {
        question: "Como funciona a validação de questionários?",
        answer: "Você pode subir planilhas XLSX ou CSV. A IA lê cada linha, cruza as perguntas com as políticas indexadas no RAG, gera respostas embasadas e preenche o arquivo para download."
      },
      {
        question: "De onde vêm as respostas do Chat?",
        answer: "Elas são geradas estritamente com base nos documentos que passaram pelo Clarity Gate e estão publicados na base de conhecimento."
      }
    ],
    tourSteps: [
      {
        targetId: "chat-suggestion-chips",
        title: "Perguntas Frequentes",
        content: "Clique em uma das sugestões rápidas para testar a agilidade de resposta do RAG."
      },
      {
        targetId: "chat-input-area",
        title: "Área de Interação",
        content: "Envie suas dúvidas textuais ou faça upload de uma planilha de perguntas clicando no ícone do clipe."
      }
    ]
  },
  "/reports": {
    title: "Relatórios de Conformidade",
    subtitle: "Exportação e compilação de relatórios de gaps e prioridades",
    description: "Interface para geração de relatórios de auditoria estáticos e exportação para formatos XLSX (Excel) e PDF.",
    faqs: [
      {
        question: "O que o relatório Excel exportado contém?",
        answer: "Contém 3 planilhas: Visão Geral de conformidade, Plano de Remediação detalhado com priorização de ROI e a Lista completa de Gaps com anotações."
      }
    ],
    tourSteps: [
      {
        targetId: "generate-report-btn",
        title: "Gerar Relatório Completo",
        content: "Compila o estado atual da conformidade e salva um snapshot estático na base de relatórios."
      },
      {
        targetId: "reports-list-table",
        title: "Exportar e Visualizar",
        content: "Baixe relatórios gerados em PDF estruturado ou em formato de planilhas integradas do Excel."
      }
    ]
  }
};

const DEFAULT_HELP: PageHelpData = {
  title: "Ajuda Online ihOS",
  subtitle: "Suporte contextual de conformidade e governança",
  description: "Selecione uma das páginas do menu para ver informações de suporte contextualizadas.",
  faqs: [
    {
      question: "O que é o ihOS?",
      answer: "O ihOS é um sistema autônomo de governança, risco e conformidade (GRC) projetado para acelerar processos de auditoria (como o TX-RAMP) e automatizar o controle de políticas corporativas."
    },
    {
      question: "O que é o RAG no contexto da plataforma?",
      answer: "RAG (Retrieval-Augmented Generation) é a arquitetura que permite à inteligência artificial recuperar trechos de suas políticas internas de segurança para fundamentar suas respostas de auditoria de forma precisa."
    }
  ],
  tourSteps: []
};

// ─────────────────────────────────────────────────────────────────────────────
// Context Provider Implementation
// ─────────────────────────────────────────────────────────────────────────────

const HelpContext = createContext<HelpContextType | undefined>(undefined);

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [activeHelpData, setActiveHelpData] = useState<PageHelpData>(DEFAULT_HELP);

  // Update active help data when pathname changes
  useEffect(() => {
    // Exact match or fallback to base route if path is deep (e.g. /assessments/[id] -> /assessments)
    let matchingPath = pathname || "/";
    
    if (matchingPath.startsWith("/assessments/") && matchingPath !== "/assessments") {
      matchingPath = "/assessments";
    }
    if (matchingPath.startsWith("/chat/") && matchingPath !== "/chat") {
      matchingPath = "/chat";
    }

    const data = HELP_DATABASE[matchingPath] || DEFAULT_HELP;
    setActiveHelpData(data);
    
    // Stop tour if user changes pages
    setTourActive(false);
    setTourStep(0);
  }, [pathname]);

  const openHelp = () => setIsOpen(true);
  const closeHelp = () => {
    setIsOpen(false);
    setTourActive(false);
  };
  const toggleHelp = () => setIsOpen((prev) => !prev);

  const startTour = () => {
    if (activeHelpData.tourSteps.length > 0) {
      setIsOpen(false); // Close sidebar when tour starts to prevent clutter
      setTourStep(0);
      setTourActive(true);
    }
  };

  const stopTour = () => {
    setTourActive(false);
    setTourStep(0);
  };

  const nextTourStep = () => {
    if (tourStep < activeHelpData.tourSteps.length - 1) {
      setTourStep((prev) => prev + 1);
    } else {
      stopTour();
    }
  };

  const prevTourStep = () => {
    if (tourStep > 0) {
      setTourStep((prev) => prev - 1);
    }
  };

  return (
    <HelpContext.Provider
      value={{
        isOpen,
        openHelp,
        closeHelp,
        toggleHelp,
        tourActive,
        tourStep,
        startTour,
        stopTour,
        nextTourStep,
        prevTourStep,
        activeHelpData,
      }}
    >
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const context = useContext(HelpContext);
  if (!context) {
    throw new Error("useHelp must be used within a HelpProvider");
  }
  return context;
}
