-- ============================================================================
-- Seed Data — ihOS Supabase Database
-- ihOS — Intelligent Hardened Operating System
--
-- Seeds the database with reference data for development and testing:
--   1. Sample SCF controls (10 controls across 5 domains)
--   2. Sample framework mappings (ISO-27001, SOC-2, NIST-800-53)
--
-- NOTE: This file does NOT insert real user data or compliance documents.
-- Document ingestion is handled by the ETL pipeline (etl/).
-- User creation is handled by Supabase Auth + handle_new_user() trigger.
--
-- Usage: supabase db reset (runs migrations + seed)
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. SAMPLE SCF CONTROLS
-- ──────────────────────────────────────────────────────────────────────────────
-- 10 representative controls from the Secure Controls Framework (SCF)
-- Embeddings are NULL — will be populated by the embedding pipeline
INSERT INTO public.scf_controls (control_code, domain_code, control_name, description) VALUES

-- Asset Management domain (AST)
('AST-01', 'AST', 'Asset Governance',
 'Mechanisms exist to facilitate the implementation of asset management controls.'),

('AST-04', 'AST', 'Asset Inventories',
 'Mechanisms exist to develop, document, and maintain an inventory of technology assets.'),

-- Cryptographic Protections domain (CRY)
('CRY-01', 'CRY', 'Use of Cryptographic Controls',
 'Mechanisms exist to facilitate the implementation of cryptographic protections using known public standards and trusted cryptographic technologies.'),

('CRY-03', 'CRY', 'Transmission Confidentiality',
 'Mechanisms exist to protect the confidentiality of transmitted information.'),

-- Data Classification & Handling domain (DCH)
('DCH-01', 'DCH', 'Data Protection',
 'Mechanisms exist to facilitate the implementation of data protection controls.'),

('DCH-06', 'DCH', 'Data Quality Operations',
 'Mechanisms exist to ensure data quality through accuracy, integrity, and consistency of data.'),

-- Identity & Access Management domain (IAC)
('IAC-01', 'IAC', 'Identity & Access Management (IAM)',
 'Mechanisms exist to facilitate the implementation of identification and access management controls.'),

('IAC-06', 'IAC', 'Least Privilege',
 'Mechanisms exist to utilize the concept of least privilege, allowing only authorized access for users, processes, and devices.'),

-- Privacy domain (PRI)
('PRI-01', 'PRI', 'Data Privacy',
 'Mechanisms exist to facilitate the implementation of data privacy controls.'),

('PRI-03', 'PRI', 'Choice & Consent',
 'Mechanisms exist to provide individuals the ability to consent to the processing of their personal data.')

ON CONFLICT (control_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. SAMPLE FRAMEWORK MAPPINGS
-- ──────────────────────────────────────────────────────────────────────────────
-- Maps ISO 27001:2022, SOC 2, and NIST 800-53 controls to SCF controls
-- These demonstrate the cross-framework mapping capability

INSERT INTO public.scf_framework_mappings (framework_code, target_control_id, scf_control_code) VALUES

-- ISO 27001:2022 → SCF mappings
('ISO-27001', 'A.5.9',  'AST-01'),    -- Information security in asset management
('ISO-27001', 'A.5.10', 'AST-04'),    -- Acceptable use of assets
('ISO-27001', 'A.8.24', 'CRY-01'),    -- Use of cryptography
('ISO-27001', 'A.8.26', 'DCH-01'),    -- Application security requirements
('ISO-27001', 'A.5.15', 'IAC-01'),    -- Access control
('ISO-27001', 'A.8.3',  'IAC-06'),    -- Least privilege
('ISO-27001', 'A.5.34', 'PRI-01'),    -- Privacy and protection of PII

-- SOC 2 → SCF mappings
('SOC-2', 'CC6.1', 'IAC-01'),         -- Logical and physical access controls
('SOC-2', 'CC6.3', 'IAC-06'),         -- Least privilege and segregation
('SOC-2', 'CC6.7', 'CRY-03'),         -- Encryption of data in transit
('SOC-2', 'CC7.1', 'AST-04'),         -- Asset management
('SOC-2', 'P6.1', 'PRI-01'),          -- Privacy criteria
('SOC-2', 'P6.5', 'PRI-03'),          -- Consent

-- NIST 800-53 Rev 5 → SCF mappings
('NIST-800-53', 'AC-1',  'IAC-01'),   -- Access control policy
('NIST-800-53', 'AC-6',  'IAC-06'),   -- Least privilege
('NIST-800-53', 'CM-8',  'AST-04'),   -- System component inventory
('NIST-800-53', 'SC-8',  'CRY-03'),   -- Transmission confidentiality
('NIST-800-53', 'SC-12', 'CRY-01'),   -- Cryptographic key management
('NIST-800-53', 'SI-12', 'DCH-06'),   -- Information management and retention
('NIST-800-53', 'PT-4',  'PRI-03')    -- Consent

ON CONFLICT ON CONSTRAINT uq_scf_mapping DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. VERIFICATION QUERIES (for development — uncomment to test)
-- ──────────────────────────────────────────────────────────────────────────────
-- SELECT count(*) AS scf_control_count FROM public.scf_controls;
-- SELECT count(*) AS mapping_count FROM public.scf_framework_mappings;
-- SELECT framework_code, count(*) FROM public.scf_framework_mappings GROUP BY framework_code;
-- SELECT * FROM public.scf_controls ORDER BY control_code;
