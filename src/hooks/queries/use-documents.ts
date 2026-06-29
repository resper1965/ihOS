import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const DocumentSchema = z.object({
  id: z.number(),
  filename: z.string(),
  filepath: z.string(),
  doc_type: z.string(),
  policy_number: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
  year: z.number().nullable().default(null),
  category: z.enum(["ISMS_CORE", "B2B_GEHC", "B2B_DIRECT", "OPERATIONAL"]).nullable().default(null),
  file_format: z.string().nullable().default(null),
  file_size_bytes: z.number().nullable().default(null),
  total_chunks: z.number().nullable().default(null),
  product_version_id: z.string().nullable().default(null),
  version: z.string(),
  status: z.enum(['draft', 'published', 'superseded', 'expired']).catch('draft'),
  expires_at: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

export type Document = z.infer<typeof DocumentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...documentKeys.lists(), filters] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useDocuments(versionId?: string | null) {
  return useQuery({
    queryKey: documentKeys.list({ versionId }),
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('compliance_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (versionId) {
        query = query.eq('product_version_id', versionId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return (data ?? []).map((row: unknown) => DocumentSchema.parse(row));
    },
    staleTime: 60_000,
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (docId: number) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('compliance_documents')
        .delete()
        .eq('id', docId);

      if (error) throw new Error(error.message);
      return docId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}
