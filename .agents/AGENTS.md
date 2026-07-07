# iNOS Architecture & Philosophy Guidelines

## 1. Core Principle: SCF-First
The **Secure Controls Framework (SCF)** is the single source of truth and the fundamental atom of the system. 
All intelligence flows from the bottom up:
1.  **Evidence Ingestion**: Documents and code are read/analyzed to extract technical evidence.
2.  **Control Feeding**: This evidence feeds and validates specific **SCF Controls**.
3.  **Standard Mapping**: Compliance with international standards (**ISO 27001, ISO 27701, GDPR, LGPD**) is a secondary, automatic reflection of the underlying SCF control status.

## 2. Strategic Focus
The platform's primary mission is to protect and maintain the following earned certifications:
*   **ISO/IEC 27001:2022** (Information Security)
*   **ISO/IEC 27701:2019** (Privacy Information Management)
*   **EU GDPR** (European Privacy)
*   **LGPD** (Brazilian Privacy)

## 3. Automation Pipeline (GRC 2026)
The continuous compliance pipeline is orchestrated via 5 automated phases:
1.  **Knowledge Base Sync**: Auto-tagging documents to SCF controls.
2.  **Automated Assessment**: Continuous auditing of SCF controls against ingested evidence.
3.  **Threat Modeling**: STRIDE analysis mapped to SCF mitigation controls.
4.  **SCRMS Recalibration**: Risk-driven prioritization of SCF controls (DSR/MCR).
5.  **Scorecard Synchronization**: Automatic reflection of SCF health into ISO/GDPR scores.

## 4. Implementation Constraints
*   **Admin Client Use**: Background/Cron tasks must use `createAdminClient` and internal API keys to bypass user session requirements.
*   **Production Guardrails**: All modifying actions must target the production environment (Vercel/Supabase) to ensure real-world compliance posture.
