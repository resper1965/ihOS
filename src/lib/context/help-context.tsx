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
    title: "Dashboard",
    subtitle: "Consolidated view of compliance and governance",
    description: "This dashboard centralizes the general status of your organization's regulatory and security compliance posture.",
    faqs: [
      {
        question: "How is the Compliance Score calculated?",
        answer: "It is the calculated average score of the active regulatory and discretionary controls mapped to your current baseline."
      },
      {
        question: "What does the Activity Feed show?",
        answer: "Displays recent automated compliance events, such as pending task reminders, risk acceptance expirations, or framework score updates."
      },
      {
        question: "Where does the vulnerability posture data come from?",
        answer: "It is synchronized daily from your configured vulnerability scanner. The SLA bar shows the remaining time to remediate based on open vulnerabilities and defined severity thresholds."
      }
    ],
    tourSteps: [
      {
        targetId: "stats-grid-dashboard",
        title: "Quick Indicators",
        content: "View totals of monitored frameworks, uploaded documents, active assessments, and overall baseline compliance score."
      },
      {
        targetId: "vulnerability-posture-card",
        title: "Vulnerability Posture",
        content: "Aggregated metrics from your vulnerability scanner. Track SLA compliance based on vulnerability severity."
      },
      {
        targetId: "activity-feed-card",
        title: "Activity History",
        content: "Logs important system updates, tasks nearing expiration, and baseline score updates."
      },
      {
        targetId: "goals-widget-card",
        title: "Remediation Tracking",
        content: "Monitor active goals opened to resolve identified compliance gaps."
      }
    ]
  },
  "/compliance": {
    title: "Compliance Intelligence",
    subtitle: "Deep analysis of security posture and optimal action plan",
    description: "Analyze the score of each standard, identify control overlaps, and prioritize remediation projects with the highest return on investment (ROI).",
    faqs: [
      {
        question: "What is ROI-based remediation prioritization?",
        answer: "The system maps shared controls across frameworks. Implementing a control that satisfies multiple requirements simultaneously offers a higher return on investment (ROI)."
      },
      {
        question: "How do RAG confidence levels work?",
        answer: "Represents the confidence level that the uploaded evidence satisfies the control requirement, based on semantic audit verification."
      }
    ],
    tourSteps: [
      {
        targetId: "compliance-scorecards",
        title: "Framework Posture",
        content: "Compare performance across different standards, detailing covered controls and open gaps."
      },
      {
        targetId: "remediation-roi-card",
        title: "Priority Remediation (ROI)",
        content: "Follow this list to optimize tasks, focusing on controls that cover the largest integration footprint."
      },
      {
        targetId: "compliance-gaps-table",
        title: "Critical Gaps List",
        content: "Lists controls that are in a failed state or missing evidence."
      }
    ]
  },
  "/compliance/mappings": {
    title: "GRC Mappings",
    subtitle: "Map internal controls to external security frameworks",
    description: "Displays the direct relationship between local control sets and external regulatory standards.",
    faqs: [
      {
        question: "What happens when synchronizing mappings?",
        answer: "The platform connects with the central GRC API to pull the latest mapping definitions and translation updates."
      },
      {
        question: "Can I upload custom mappings?",
        answer: "Yes, using the upload tool you can submit custom spreadsheets correlating internal controls with new security baselines."
      }
    ],
    tourSteps: [
      {
        targetId: "mappings-sync-button",
        title: "Synchronization",
        content: "Sync GRC mappings to ensure local definitions match the latest regulatory standards."
      },
      {
        targetId: "mappings-search-input",
        title: "Search Filter",
        content: "Search for specific mappings by keyword, local control code, or target framework."
      }
    ]
  },
  "/documents": {
    title: "Document Manager & Ingestion",
    subtitle: "Submit policies, evidence, and classifications",
    description: "Central hub to upload and manage the corporate policy and evidence documents that feed the knowledge base.",
    faqs: [
      {
        question: "What is the Clarity Gate?",
        answer: "It is an AI-based validator that checks the clarity and precision of submitted text, ensuring it is free of contradictions or overly vague terms before indexing."
      },
      {
        question: "What does a pending status mean?",
        answer: "If a document is flagged as ambiguous or fails automatic validation, it is queued for manual auditor review before it can be added to the active knowledge base."
      }
    ],
    tourSteps: [
      {
        targetId: "document-upload-btn",
        title: "New Document",
        content: "Launch the wizard to upload a new file, select its scope (global or product-specific), and assign its category."
      },
      {
        targetId: "document-filter-tabs",
        title: "Filter Views",
        content: "Classify documents by scope, such as organization-wide policies or specific product release documents."
      },
      {
        targetId: "document-list-table",
        title: "Document Table",
        content: "Track the validation status of each file. Unapproved or rejected files are excluded from the knowledge base."
      }
    ]
  },
  "/assessments": {
    title: "Audits & Assessments",
    subtitle: "Run automated compliance audits and manage POAMs",
    description: "Execute audits, generate compliance reports, and manage Plan of Action and Milestones (POAM) items for temporary risk acceptance.",
    faqs: [
      {
        question: "What is the difference between audit modes?",
        answer: "Quick mode reviews textual evidence alignments, while Deep mode executes detailed analysis to verify evidence in specific files."
      },
      {
        question: "How does risk acceptance expiration work?",
        answer: "A control gap can be granted a temporary risk acceptance. When this period expires, the acceptance is revoked, and the system raises a task alert."
      }
    ],
    tourSteps: [
      {
        targetId: "run-assessment-btn",
        title: "Start New Audit",
        content: "Configure and run a real-time compliance scan based on the active document knowledge base."
      },
      {
        targetId: "assessments-history-list",
        title: "Audit History",
        content: "Review past compliance scans and compare progress over time."
      }
    ]
  },
  "/goals": {
    title: "Remediation Projects & Goals",
    subtitle: "Track compliance objectives and remediation progress",
    description: "Monitor the resolution of security gaps through high-level goals broken down into technical tasks.",
    faqs: [
      {
        question: "Why do some tasks require manual approval?",
        answer: "To maintain control over sensitive actions, operations falling outside the agent's autonomous limits require explicit auditor confirmation."
      },
      {
        question: "How is goal progress calculated?",
        answer: "Progress is proportional to the completion rate of the technical tasks associated with the goal."
      }
    ],
    tourSteps: [
      {
        targetId: "create-goal-btn",
        title: "New Remediation Goal",
        content: "Create a new project associated with a framework to track required fixes."
      },
      {
        targetId: "goals-accordion-list",
        title: "Project List",
        content: "Expand any goal to view linked tasks, deadlines, and assigned resources."
      }
    ]
  },
  "/chat": {
    title: "GRC AI Assistant",
    subtitle: "Conversational interface powered by compliance knowledge",
    description: "Direct channel to query internal policies, request analysis, or submit audit questionnaires.",
    faqs: [
      {
        question: "How does questionnaire validation work?",
        answer: "You can upload questionnaire spreadsheets. The assistant cross-references each question against indexed policies, generates verified answers, and compiles them for download."
      },
      {
        question: "Where do the assistant's answers come from?",
        answer: "Answers are generated strictly using policy and evidence documents that have passed clarity validation."
      }
    ],
    tourSteps: [
      {
        targetId: "chat-suggestion-chips",
        title: "Frequently Asked Questions",
        content: "Click on any suggestion chip to test the assistant's response speed."
      },
      {
        targetId: "chat-input-area",
        title: "Interaction Area",
        content: "Send text questions or upload a questionnaire spreadsheet."
      }
    ]
  },
  "/reports": {
    title: "Compliance Reports",
    subtitle: "Export and compile audit summaries",
    description: "Generate static compliance reports and export data to spreadsheet or document formats.",
    faqs: [
      {
        question: "What does the exported report contain?",
        answer: "It contains a compliance status overview, a prioritized remediation plan, and the complete gap list."
      }
    ],
    tourSteps: [
      {
        targetId: "generate-report-btn",
        title: "Generate Full Report",
        content: "Compile the current compliance state and save a snapshot static report."
      },
      {
        targetId: "reports-list-table",
        title: "Export and View",
        content: "Download compiled reports in PDF or spreadsheet format."
      }
    ]
  },
  "/threat-modeling": {
    title: "Threat Modeling",
    subtitle: "Identify STRIDE threats and quantify risks with FMEA",
    description: "Generate and review threat models for product versions based on compliance specifications and design documents.",
    faqs: [
      {
        question: "How is the Threat Model constructed?",
        answer: "It uses AI (RAG) to analyze design specs, EULAs, agreements, and requirements documents associated with the selected version, identifying threats across all 6 STRIDE categories."
      },
      {
        question: "What is FMEA in the context of threat modeling?",
        answer: "Failure Mode and Effects Analysis (FMEA) calculates a Risk Priority Number (RPN = Severity x Occurrence x Detection) for each threat, allowing risk-based prioritization."
      },
      {
        question: "Why do we generate reports for approved models?",
        answer: "Once a model is reviewed and approved, generating a report locks the results into a static PDF or Excel snapshot to serve as compliance evidence for audit trails."
      }
    ],
    tourSteps: [
      {
        targetId: "threat-modeling-summary",
        title: "Risk Summary Metrics",
        content: "Track total threats identified, average RPN score, critical/high severity count, and associated compliance gaps."
      },
      {
        targetId: "risk-matrix-card",
        title: "5x5 Risk Matrix",
        content: "Visual heat map correlating threat likelihood against impact severity."
      },
      {
        targetId: "stride-radar-card",
        title: "STRIDE Radar",
        content: "Distribution of threats across Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege."
      }
    ]
  }
};

const DEFAULT_HELP: PageHelpData = {
  title: "ihOS Online Help",
  subtitle: "Contextual compliance and governance support",
  description: "Select any page in the navigation menu to display relevant help and documentation.",
  faqs: [
    {
      question: "What is ihOS?",
      answer: "ihOS is an autonomous governance, risk, and compliance (GRC) operating system designed to accelerate security audits and automate policy management."
    },
    {
      question: "What is RAG in this platform?",
      answer: "Retrieval-Augmented Generation (RAG) is the architecture that allows the AI to securely retrieve sections of your internal policies to answer audit questions accurately."
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
    if (matchingPath.startsWith("/threat-modeling/") && matchingPath !== "/threat-modeling") {
      matchingPath = "/threat-modeling";
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
