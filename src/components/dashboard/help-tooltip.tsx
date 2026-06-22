"use client";

import React from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  content: string;
  className?: string;
  position?: "top" | "bottom" | "left" | "right";
}

export function HelpTooltip({
  content,
  className = "",
  position = "top",
}: HelpTooltipProps) {
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-slate-950/90",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-950/90",
    left: "left-full top-1/2 -translate-y-1/2 border-l-slate-950/90",
    right: "right-full top-1/2 -translate-y-1/2 border-r-slate-950/90",
  };

  return (
    <span className={`relative inline-flex items-center group cursor-help ${className}`}>
      <HelpCircle className="h-3.5 w-3.5 text-slate-500 hover:text-primary transition-colors duration-150" />
      
      {/* Tooltip Card */}
      <span
        role="tooltip"
        className={`
          absolute z-50 pointer-events-none
          invisible opacity-0 group-hover:visible group-hover:opacity-100
          transition-all duration-200 ease-out transform scale-95 group-hover:scale-100
          w-56 p-2.5 rounded-xl border border-white/10 bg-slate-950/95 shadow-xl text-[11px] leading-relaxed text-slate-300 font-normal
          ${positionClasses[position]}
        `}
      >
        {content}

        {/* Small Arrow indicator */}
        <span
          className={`
            absolute border-[6px] border-transparent
            ${arrowClasses[position]}
          `}
        />
      </span>
    </span>
  );
}
