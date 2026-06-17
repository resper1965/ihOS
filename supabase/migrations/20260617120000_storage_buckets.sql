-- ============================================================================
-- Migration: Create Storage Bucket for Compliance Documents
-- ============================================================================

-- Create the private bucket for storing uploaded PDF/DOCX evidence
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'compliance_documents', 
    'compliance_documents', 
    false, 
    52428800, -- 50MB
    '{application/pdf,text/plain,text/csv,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS Policies for the bucket
-- Allow authenticated users to perform all operations on compliance_documents

CREATE POLICY "Authenticated users can upload compliance documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'compliance_documents');

CREATE POLICY "Authenticated users can read compliance documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'compliance_documents');

CREATE POLICY "Authenticated users can update compliance documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'compliance_documents');

CREATE POLICY "Authenticated users can delete compliance documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'compliance_documents');
