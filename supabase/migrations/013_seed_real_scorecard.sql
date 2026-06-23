-- Seed real compliance scorecard data for nCommand Lite
-- Based on RAG-verified certifications from document_chunks
-- Certificate #214276 - URS Portugal

INSERT INTO intelligence_snapshots (snapshot_type, framework_code, input_payload, result_payload, snapshot_data, score)
VALUES
  -- ISO 27001:2022 - CERTIFIED (Certificate #214276, URS Portugal, Active)
  ('scorecard', 'iso27001',
   '{"source": "rag_verified", "certificate": "#214276"}'::jsonb,
   '{"status": "certified", "auditor": "URS Portugal"}'::jsonb,
   '{"name": "ISO 27001:2022", "score": 95, "coverage": 100, "missing": 0, "source": "URS Portugal Certificate #214276 - Active - SU1 2026 Maintenance Audit completed May 2026"}'::jsonb,
   95),

  -- ISO 27701:2019 - CERTIFIED (Certificate #214276 combined, URS Portugal, Active)
  ('scorecard', 'iso27701',
   '{"source": "rag_verified", "certificate": "#214276"}'::jsonb,
   '{"status": "certified", "auditor": "URS Portugal"}'::jsonb,
   '{"name": "ISO 27701:2019", "score": 95, "coverage": 100, "missing": 0, "source": "URS Portugal Certificate #214276 (combined) - Active - Privacy extension integrated"}'::jsonb,
   95),

  -- BR-LGPD - Fully compliant via ISO 27701 + Brazilian specific controls
  ('scorecard', 'BR-LGPD',
   '{"source": "derived", "base": "iso27701"}'::jsonb,
   '{"status": "compliant"}'::jsonb,
   '{"name": "LGPD", "score": 100, "coverage": 100, "missing": 0, "source": "Derived from ISO 27701 privacy controls + Brazilian-specific compliance"}'::jsonb,
   100),

  -- HIPAA - Partial coverage via ISO 27001 cross-mapping
  ('scorecard', 'HI-2013',
   '{"source": "cross_mapped", "base": "iso27001"}'::jsonb,
   '{"status": "partial_coverage"}'::jsonb,
   '{"name": "HIPAA", "score": null, "coverage": 76, "missing": 40, "source": "Coverage analysis from ISO 27001 Annex A cross-mapping to HIPAA Security Rule"}'::jsonb,
   NULL),

  -- EU GDPR - High coverage via ISO 27701 + GDPR-specific articles
  ('scorecard', 'EU-GDPR',
   '{"source": "derived", "base": "iso27701"}'::jsonb,
   '{"status": "high_coverage"}'::jsonb,
   '{"name": "EU GDPR", "score": null, "coverage": 88, "missing": 12, "source": "Derived from ISO 27701 privacy controls + GDPR Articles 5-49 mapping"}'::jsonb,
   NULL);

-- Update the "all" scorecard to reflect correct data
UPDATE intelligence_snapshots
SET snapshot_data = '{"frameworks": [
  {"code": "iso27001", "name": "ISO 27001:2022", "score": 95, "coverage": 100, "missing": 0, "icon": "🔒"},
  {"code": "iso27701", "name": "ISO 27701:2019", "score": 95, "coverage": 100, "missing": 0, "icon": "🛡️"},
  {"code": "BR-LGPD", "name": "LGPD", "score": 100, "coverage": 100, "missing": 0, "icon": "🇧🇷"},
  {"code": "HI-2013", "name": "HIPAA", "score": null, "coverage": 76, "missing": 40, "icon": "🏥"},
  {"code": "EU-GDPR", "name": "EU GDPR", "score": null, "coverage": 88, "missing": 12, "icon": "🇪🇺"}
]}'::jsonb
WHERE snapshot_type = 'scorecard'
  AND framework_code = 'all';

