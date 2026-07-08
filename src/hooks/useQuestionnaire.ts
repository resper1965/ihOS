"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ExtractedQuestion,
  ParseResult,
  ReviewableQA,
  ReviewStatus,
  PromotionResult,
} from "@/lib/chat/questionnaire-types";

// ── State machine ────────────────────────────────────────────────────────────

export type QuestionnaireState =
  | "idle"
  | "uploading"
  | "parsing"
  | "generating"
  | "reviewing"
  | "promoting"
  | "downloading"
  | "complete"
  | "error";

/** Mandatory analysis context (NPR v3 Moment 1): sales channel selects the
 *  contractual overlay and Ionic's privacy role; version scopes the corpus. */
export interface QuestionnaireContext {
  salesChannel: "B2B_GEHC" | "B2B_DIRECT";
  productVersionId?: string | null;
}

export interface QuestionnaireStore {
  /** Current state of the flow */
  state: QuestionnaireState;
  /** Parsed questions from the uploaded file */
  questions: ExtractedQuestion[];
  /** Reviewable Q&A items (after answer generation) */
  answers: ReviewableQA[];
  /** Original file as base64 for xlsx write-back */
  originalFileBase64: string;
  /** Uploaded file name */
  fileName: string;
  /** Progress 0-100 for long operations */
  progress: number;
  /** Error message when state === 'error' */
  error: string | null;
  /** Parse metadata */
  parseResult: ParseResult | null;
  /** Context the answers were generated under (echoed on promotion) */
  context: QuestionnaireContext | null;
}

const INITIAL_STORE: QuestionnaireStore = {
  state: "idle",
  questions: [],
  answers: [],
  originalFileBase64: "",
  fileName: "",
  progress: 0,
  error: null,
  parseResult: null,
  context: null,
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useQuestionnaire() {
  const [store, setStore] = useState<QuestionnaireStore>(INITIAL_STORE);
  const abortRef = useRef<AbortController | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const patch = useCallback(
    (partial: Partial<QuestionnaireStore>) =>
      setStore((prev) => ({ ...prev, ...partial })),
    [],
  );

  const fail = useCallback(
    (msg: string) => patch({ state: "error", error: msg, progress: 0 }),
    [patch],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStore(INITIAL_STORE);
  }, []);

  // ── File → base64 helper ───────────────────────────────────────────────

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data URL prefix  "data:…;base64,"
        resolve(result.split(",")[1] ?? result);
      };
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }

  // ── 1. Upload & Parse ──────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: File, context: QuestionnaireContext) => {
      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        patch({ state: "uploading", fileName: file.name, progress: 10, error: null, context });

        // Convert to base64 in parallel
        const base64 = await fileToBase64(file);
        patch({ originalFileBase64: base64, progress: 30 });

        // Build form data for parse endpoint
        const formData = new FormData();
        formData.append("file", file);

        patch({ state: "parsing", progress: 40 });

        const parseRes = await fetch("/api/chat/parse-questionnaire", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!parseRes.ok) {
          const body = await parseRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Error analyzing file (${parseRes.status})`);
        }

        const parseBody = await parseRes.json();
        const parseData: ParseResult = parseBody.data ?? parseBody;
        patch({
          state: "generating",
          questions: parseData.questions,
          parseResult: parseData,
          progress: 60,
        });

        // ── 2. Generate answers ────────────────────────────────────────────

        const genRes = await fetch("/api/chat/generate-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: parseData.questions,
            salesChannel: context.salesChannel,
            productVersionId: context.productVersionId ?? undefined,
          }),
          signal: controller.signal,
        });

        if (!genRes.ok) {
          const body = await genRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Error generating answers (${genRes.status})`);
        }

        const genBody = await genRes.json();
        const generatedAnswers = genBody.data ?? genBody.answers ?? [];

        // Map GeneratedAnswer[] to ReviewableQA[]
        const reviewable: ReviewableQA[] = generatedAnswers.map((ga: any) => ({
          questionId: ga.questionId,
          questionText: ga.questionText,
          aiDraftAnswer: ga.generatedAnswer,
          finalAnswer: ga.generatedAnswer,
          confidenceScore: ga.confidenceScore ?? 0,
          references: ga.references ?? [],
          status: 'pending' as ReviewStatus,
          // Provenance for the human reviewer (F3)
          answerSource: ga.answerSource,
          needsReview: ga.needsReview ?? false,
          stalenessWarning: ga.stalenessWarning,
        }));

        // Merge cell coords from parse result into review items
        const answersWithCoords: ReviewableQA[] = reviewable.map((a) => {
          const q = parseData.questions.find((q) => q.questionId === a.questionId);
          return {
            ...a,
            cellCoords: q?.cellCoords ?? a.cellCoords,
            sheetName: q?.sheetName ?? a.sheetName,
            rowIndex: q?.rowIndex ?? a.rowIndex,
          };
        });

        patch({ state: "reviewing", answers: answersWithCoords, progress: 100 });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        fail(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [patch, fail],
  );

  // ── Review actions ────────────────────────────────────────────────────

  const updateAnswer = useCallback(
    (questionId: string, newAnswer: string) => {
      setStore((prev) => ({
        ...prev,
        answers: prev.answers.map((a) =>
          a.questionId === questionId
            ? { ...a, finalAnswer: newAnswer, status: "edited" as ReviewStatus }
            : a,
        ),
      }));
    },
    [],
  );

  const setStatus = useCallback(
    (questionId: string, status: ReviewStatus) => {
      setStore((prev) => ({
        ...prev,
        answers: prev.answers.map((a) =>
          a.questionId === questionId ? { ...a, status } : a,
        ),
      }));
    },
    [],
  );

  const approveAll = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      answers: prev.answers.map((a) => ({
        ...a,
        status: a.status === "rejected" ? a.status : ("approved" as ReviewStatus),
      })),
    }));
  }, []);

  const rejectAll = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      answers: prev.answers.map((a) => ({
        ...a,
        status: "rejected" as ReviewStatus,
      })),
    }));
  }, []);

  // ── 3. Promote & Download ──────────────────────────────────────────────

  const promoteAndDownload = useCallback(async () => {
    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const approved = store.answers.filter((a) => a.status !== "rejected");
      if (approved.length === 0) {
        fail("No approved answers to export.");
        return;
      }

      // ── Promote to knowledge base ──
      patch({ state: "promoting", progress: 20 });

      const promoRes = await fetch("/api/chat/promote-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: approved.map((a) => ({
            questionId: a.questionId,
            questionText: a.questionText,
            finalAnswer: a.finalAnswer,
            aiDraftAnswer: a.aiDraftAnswer,
            wasEdited: a.status === "edited",
          })),
          // Scope the promoted answers (F5): without this they would be
          // parked as needs_review and never served.
          salesChannel: store.context?.salesChannel ?? null,
          productVersionId: store.context?.productVersionId ?? null,
        }),
        signal: controller.signal,
      });

      if (!promoRes.ok) {
        const body = await promoRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Promotion error (${promoRes.status})`);
      }

      const _promoResult: PromotionResult = await promoRes.json();

      // ── Download filled file ──
      patch({ state: "downloading", progress: 60 });

      const dlRes = await fetch("/api/chat/download-filled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFileBase64: store.originalFileBase64,
          fileName: store.fileName,
          answers: approved.map((a) => ({
            cellCoords: a.cellCoords,
            sheetName: a.sheetName,
            rowIndex: a.rowIndex,
            answerColumnIndex: store.parseResult?.answerColumnIndex,
            answer: a.finalAnswer,
          })),
        }),
        signal: controller.signal,
      });

      if (!dlRes.ok) {
        const body = await dlRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Download error (${dlRes.status})`);
      }

      // Trigger browser download
      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = store.fileName.replace(/\.[^.]+$/, "_completed.xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      patch({ state: "complete", progress: 100 });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      fail(err instanceof Error ? err.message : "Unknown error");
    }
  }, [store.answers, store.originalFileBase64, store.fileName, store.parseResult, store.context, patch, fail]);

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    ...store,
    uploadFile,
    updateAnswer,
    setStatus,
    approveAll,
    rejectAll,
    promoteAndDownload,
    reset,
  } as const;
}
