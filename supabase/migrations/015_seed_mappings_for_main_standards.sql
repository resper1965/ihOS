-- ============================================================================
-- Migration: 015_seed_mappings_for_main_standards
-- ihOS — Intelligent Hardened Operating System
--
-- Seeds framework mappings for BR-LGPD, EU-GDPR, and HI-2013 by cloning
-- mappings from existing iso27701 and iso27001 standards.
-- ============================================================================

-- Seed mappings for BR-LGPD by cloning iso27701 mappings
INSERT INTO public.scf_framework_mappings (framework_code, target_control_id, scf_control_code)
SELECT 'BR-LGPD', 'LGPD-' || target_control_id, scf_control_code
FROM public.scf_framework_mappings
WHERE framework_code = 'iso27701'
ON CONFLICT ON CONSTRAINT uq_scf_mapping DO NOTHING;

-- Seed mappings for EU-GDPR by cloning iso27701 mappings
INSERT INTO public.scf_framework_mappings (framework_code, target_control_id, scf_control_code)
SELECT 'EU-GDPR', 'GDPR-' || target_control_id, scf_control_code
FROM public.scf_framework_mappings
WHERE framework_code = 'iso27701'
ON CONFLICT ON CONSTRAINT uq_scf_mapping DO NOTHING;

-- Seed mappings for HI-2013 by cloning iso27001 mappings
INSERT INTO public.scf_framework_mappings (framework_code, target_control_id, scf_control_code)
SELECT 'HI-2013', 'HIPAA-' || target_control_id, scf_control_code
FROM public.scf_framework_mappings
WHERE framework_code = 'iso27001'
ON CONFLICT ON CONSTRAINT uq_scf_mapping DO NOTHING;
