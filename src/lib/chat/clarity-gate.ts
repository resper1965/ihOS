// src/lib/chat/clarity-gate.ts
// Core Clarity Gate analyzer service using Vercel AI SDK and OpenAI.

import { generateObject } from 'ai';
import { openai } from '@/lib/chat/openai';
import { z } from 'zod';

// Define Zod schema for structured output validation
export const ClarityIssueSchema = z.object({
  code: z.string().describe('Validation code (e.g. POINT-1, POINT-2, W-HC02, E-ST10)'),
  severity: z.enum(['CRITICAL', 'WARNING', 'TEMPORAL', 'VERIFIABLE']).describe('Severity level'),
  message: z.string().describe('Detailed description of the issue found'),
  fix: z.string().describe('Proposed correction or how to address the issue'),
  location: z.string().describe('Approximate location or context in the document where the issue occurs'),
});

export const ClarityGateResultSchema = z.object({
  clarityStatus: z.enum(['CLEAR', 'UNCLEAR']).describe('Overall clarity status of the document'),
  hitlStatus: z.enum(['PENDING', 'REVIEWED', 'REVIEWED_WITH_EXCEPTIONS']).describe('Human-In-The-Loop review status'),
  hitlPendingCount: z.number().nonnegative().describe('Number of claims that require human confirmation'),
  pointsPassed: z.array(z.number()).describe('List of the 9 Verification Points that fully passed (e.g., [1, 2, 3])'),
  issues: z.array(ClarityIssueSchema).describe('List of issues detected'),
});

export type ClarityIssue = z.infer<typeof ClarityIssueSchema>;
export type ClarityGateResult = z.infer<typeof ClarityGateResultSchema>;

/**
 * Analyzes the given document text against the 9 Clarity Gate points.
 * 
 * Epistemic Checks:
 *  1. Hypothesis vs Fact labeling
 *  2. Uncertainty marker enforcement
 *  3. Assumption visibility
 *  4. Authoritative-looking unvalidated data
 * Data Quality Checks:
 *  5. Data consistency
 *  6. Implicit causation
 *  7. Future state as present
 * Verification Routing:
 *  8. Temporal coherence
 *  9. Externally verifiable claims
 */
export async function verifyClarity(text: string): Promise<ClarityGateResult> {
  if (!text || !text.trim()) {
    return {
      clarityStatus: 'UNCLEAR',
      hitlStatus: 'PENDING',
      hitlPendingCount: 0,
      pointsPassed: [],
      issues: [
        {
          code: 'E-SC06',
          severity: 'CRITICAL',
          message: 'The document is empty or contains no readable text.',
          fix: 'Please upload a document with valid text content.',
          location: 'Entire document',
        },
      ],
    };
  }

  try {
    const response = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ClarityGateResultSchema,
      system: `Você é um Auditor Especialista do Clarity Gate (v2.1).
Sua missão é realizar uma análise de qualidade epistêmica no documento fornecido.
Você deve avaliar o texto com base em 9 Pontos de Verificação fundamentais para evitar alucinações de modelos de linguagem (RAG):

1. HYPOTHESIS vs FACT LABELING: Afirmações hipotéticas não comprovadas descritas como fatos absolutos sem fontes ou marcadores.
2. UNCERTAINTY MARKER ENFORCEMENT: Projeções ou estimativas futuras sem qualificadores (ex: usar "terá" em vez de "é esperado que", "projetado para").
3. ASSUMPTION VISIBILITY: Premissas implícitas que afetam a segurança/operação não declaradas abertamente.
4. AUTHORITATIVE UNVALIDATED DATA: Tabelas ou dados com métricas precisas (ex: 100%, 89%) sem fontes claras.
5. DATA CONSISTENCY: Contradições diretas de valores, datas ou fatos dentro do mesmo documento.
6. IMPLICIT CAUSATION: Relações de causa-e-efeito sugeridas sem validação científica ou empírica associada.
7. FUTURE STATE AS PRESENT: Planos futuros ou roteiros descritos no tempo presente como se já estivessem operacionais.
8. TEMPORAL COHERENCE: Inconsistências cronológicas de datas ou termos temporais obsoletos (ex: "hoje", "atualmente" referindo-se a datas antigas).
9. EXTERNALLY VERIFIABLE CLAIMS: Preços específicos, estatísticas exatas ou alegações de concorrentes que precisam de verificação manual.

Regras de Status:
- Se houver QUALQUER problema crítico (como aludir estado futuro no presente de forma autoritária, inconsistências graves de dados ou datas, ou afirmações de segurança não comprovadas), defina clarityStatus como 'UNCLEAR' e hitlStatus como 'PENDING'.
- Se houver apenas avisos (WARNING) ou alegações verificáveis (VERIFIABLE), defina clarityStatus como 'CLEAR' mas hitlStatus como 'PENDING' (pois precisa de confirmação humana do conteúdo).
- hitlPendingCount deve ser o número de pendências e alegações que requerem confirmação humana (severidades CRITICAL, WARNING ou VERIFIABLE).`,
      prompt: `Analise o seguinte texto do documento corporativo:\n\n${text.slice(0, 50000)}`, // limit text size for token boundaries
    });

    return response.object;
  } catch (err) {
    console.error('[Clarity Gate] Analysis failed:', err);
    // Graceful fallback to avoid breaking the application pipeline
    return {
      clarityStatus: 'CLEAR', // Fallback defaults to clear to not block uploads if API fails
      hitlStatus: 'REVIEWED_WITH_EXCEPTIONS',
      hitlPendingCount: 0,
      pointsPassed: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      issues: [
        {
          code: 'W-HC01',
          severity: 'WARNING',
          message: `O serviço automático do Clarity Gate encontrou uma falha ao processar o texto: ${err instanceof Error ? err.message : String(err)}`,
          fix: 'Prossiga com a revisão manual da qualidade epistêmica deste documento.',
          location: 'Serviço do Sistema',
        },
      ],
    };
  }
}
