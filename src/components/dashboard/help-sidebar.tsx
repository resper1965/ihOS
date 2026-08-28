"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, HelpCircle, ChevronRight, Play, ArrowRight, ArrowLeft } from "lucide-react";
import { useHelp } from "@/lib/context/help-context";

// ─────────────────────────────────────────────────────────────────────────────
// Guided Tour Overlay Component
// ─────────────────────────────────────────────────────────────────────────────

interface Position {
  top: number;
  left: number;
  width: number;
  height: number;
}

function GuidedTourOverlay() {
  const { tourActive, tourStep, activeHelpData, nextTourStep, prevTourStep, stopTour } = useHelp();
  const [position, setPosition] = useState<Position | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = activeHelpData.tourSteps[tourStep];

  useEffect(() => {
    if (!tourActive || !step) return;

    const updatePosition = () => {
      const el = document.getElementById(step.targetId);
      if (el) {
        // Scroll target into view
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const rect = el.getBoundingClientRect();
        
        setPosition({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        });
      } else {
        // Fallback to center if element is not on page
        setPosition(null);
      }
    };

    // Update position on mount and whenever step changes
    updatePosition();

    // Listen to resize/scroll
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);
    
    // Timeout to catch lazy loaded tables/elements
    const t = setTimeout(updatePosition, 300);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      clearTimeout(t);
    };
  }, [tourActive, tourStep, step]);

  if (!tourActive || !step) return null;

  // Render overlay backdrop with hole or simple highlight box
  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Target Highlight Box (renders under the tooltip card) */}
      {position && (
        <div
          className="absolute z-50 rounded-xl border-2 border-primary shadow-[0_0_15px_rgba(77,217,192,0.4)] transition-all duration-300 pointer-events-none bg-primary/5"
          style={{
            top: position.top - 6,
            left: position.left - 6,
            width: position.width + 12,
            height: position.height + 12,
          }}
        />
      )}

      {/* Backdrop for click block / highlight contrast */}
      <div className="fixed inset-0 bg-black/50 pointer-events-auto z-40" onClick={stopTour} />
 
      {/* Tour Step Card */}
      <div
        ref={cardRef}
        className="fixed z-50 w-full max-w-sm border border-white/10 bg-slate-950 shadow-2xl p-5 pointer-events-auto rounded-2xl transition-all duration-200"
        style={
          position
            ? {
                // Render tooltip below the highlighted target, or centered if not enough space
                top: Math.min(position.top + position.height + 16, window.innerHeight - 250),
                left: Math.max(16, Math.min(position.left, window.innerWidth - 400)),
              }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Step {tourStep + 1} of {activeHelpData.tourSteps.length}
            </span>
          </div>
          <button
            onClick={stopTour}
            className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
 
        <h4 className="text-sm font-bold text-white mb-2">{step.title}</h4>
        <p className="text-xs text-slate-200 leading-relaxed mb-4">{step.content}</p>
 
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <button
            onClick={stopTour}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Skip Tour
          </button>
          
          <div className="flex gap-2">
            {tourStep > 0 && (
              <button
                onClick={prevTourStep}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition-all"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
            
            <button
              onClick={nextTourStep}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-primary/95 transition-all shadow-md shadow-primary/20"
            >
              {tourStep === activeHelpData.tourSteps.length - 1 ? (
                "Finish"
              ) : (
                <>
                  Next <ArrowRight className="h-3 w-3" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ Accordion Item Component
// ─────────────────────────────────────────────────────────────────────────────

function FAQAccordionItem({ item }: { item: { question: string; answer: string } }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-white/5 py-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-white hover:text-primary transition-colors focus:outline-none"
      >
        <span>{item.question}</span>
        <ChevronRight
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-90 text-primary" : ""
          }`}
        />
      </button>
      <div
        className={`mt-2 overflow-hidden text-xs text-slate-200 leading-relaxed transition-all duration-300 ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p className="pb-1">{item.answer}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HelpSidebar Component
// ─────────────────────────────────────────────────────────────────────────────

export function HelpSidebar() {
  const { isOpen, closeHelp, activeHelpData, startTour, tourActive } = useHelp();
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHelp();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeHelp]);

  if (!isOpen) {
    // If not open, we still render the GuidedTourOverlay if the tour is running
    return <GuidedTourOverlay />;
  }

  return (
    <>
      <GuidedTourOverlay />
      
      {createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={closeHelp}
          />

          {/* Drawer Sidebar */}
          <div
            ref={sidebarRef}
            role="dialog"
            aria-modal="true"
            aria-label="Contextual Help"
            className="relative w-full max-w-md h-full border-l border-white/10 bg-slate-950 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between z-50 transition-all duration-300"
          >
            {/* Header */}
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-bold text-white">Help Center</h3>
                </div>
                <button
                  onClick={closeHelp}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
 
              {/* Help Content */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-primary mb-1">
                    {activeHelpData.title}
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">{activeHelpData.subtitle}</p>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200 leading-relaxed">
                    {activeHelpData.description}
                  </div>
                </div>
 
                {/* Tour Button */}
                {activeHelpData.tourSteps.length > 0 && (
                  <button
                    onClick={startTour}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 hover:border-primary/60 px-4 py-3 text-xs font-semibold text-primary transition-all duration-200 group"
                  >
                    <Play className="h-3.5 w-3.5 fill-primary group-hover:scale-110 transition-transform" />
                    Start Interactive Tour
                  </button>
                )}
 
                {/* FAQs Accordion */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2 mb-3">
                    Frequently Asked Questions
                  </h4>
                  <div className="space-y-1">
                    {activeHelpData.faqs.map((faq, idx) => (
                      <FAQAccordionItem key={idx} item={faq} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
 
            {/* Footer */}
            <div className="border-t border-white/5 pt-4 mt-6 text-center text-[10px] text-slate-500">
              ihOS Platform • Autonomous Compliance Guide v2.2
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
