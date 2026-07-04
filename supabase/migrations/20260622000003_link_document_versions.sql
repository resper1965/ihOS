-- ============================================================================
-- Migration: Link Documents to Product Versions
-- ihOS — Intelligent Hardened Operating System
--
-- Links Software Architecture (SAD/SRS/SDS), Commercial Posture (EULA/Contracts),
-- and Infrastructure Documents to nCommand Lite v2.2.x.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v22_id UUID;
    v23_id UUID;
BEGIN
    -- 1. Retrieve the UUIDs for nCommand Lite versions
    SELECT id INTO v22_id FROM public.product_versions WHERE version_code = 'v2.2.x' LIMIT 1;
    SELECT id INTO v23_id FROM public.product_versions WHERE version_code = 'v2.3.x' LIMIT 1;

    -- 2. Link Software Architecture files to v2.2.x
    UPDATE public.compliance_documents
    SET product_version_id = v22_id, 
        version = '2.2'
    WHERE filename IN (
        'SAD - Solution Architecture Document_nCommand_Lite_v2.2.x_en-US.docx',
        'nCLite-SRS.pdf',
        'SRS - Software Requirements Specification.pdf',
        'SDS - Software Design Architecture Specification.pdf'
    );

    -- 3. Link Commercial Posture files to v2.2.x
    UPDATE public.compliance_documents
    SET product_version_id = v22_id
    WHERE filename IN (
        'Customer Training.pdf',
        'IONIC Health EULA_GEHC Comments.docx',
        'GEHC_IONIC_Health_Distribution_Agreement_11.17.23_FE.pdf',
        'gehc-pdpa-nov-16-2024.pdf'
    );

    -- 4. Link Infrastructure Architecture files to v2.2.x
    UPDATE public.compliance_documents
    SET product_version_id = v22_id
    WHERE filename IN (
        'PSI.002_Infraestrutura e Operaço de TI.docx',
        'PSI.002_Infraestrutura e Opera├з├гo de TI.docx', -- Handle potential encoding issues
        '[Infra] Compliance mapping form.xlsx',
        'Termo-de-Responsabilidade---Jefferson--P360---INFRA--docx-D4Sign.pdf',
        '1-Termo-de-Responsabilidade---Jefferson--P360---INFRA--docx.docx'
    );

END $$;

COMMIT;
