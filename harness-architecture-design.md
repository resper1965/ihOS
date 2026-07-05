# ihOS Harness Architecture Design

## Core Purpose
The **ihOS Harness** is the execution layer that transforms the platform from a "Compliance Record" (static) into an "Orchestrated Guardian" (active). It automates the validation of security controls identified during Threat Modeling.

## Architecture: The "Harness" Lifecycle

### 1. Directive Layer (Source of Truth)
The Harness reads **Mitigations** and **Related Controls** directly from the [ThreatModelData](file:///wsl.localhost/Ubuntu/home/resper/ihOS/src/lib/supabase/types-custom.ts#L503).
- **Target:** Every threat in the model has a list of `mitigations` and `related_controls`.
- **Logic:** The Harness maps these controls to **Execution Scripts**.

### 2. Southbound Connectors (The Hands)
Specialized "Analyzers" that interact with the external world to gather state.
- **Infrastructure Analyzer:** Queries AWS Config / Azure Resource Graph.
- **Code Analyzer:** Scans GitHub/GitLab for secrets, SAST results, and branch protections.
- **Process Analyzer:** Integrates with Jira/Slack to verify human-in-the-loop approvals (e.g., Change Management).

### 3. Execution Engine (The Brain)
A background runner that manages the "Check" lifecycle.
- **Job Scheduling:** Periodic checks (e.g., every 24h) or event-based (e.g., after a new deployment).
- **Evaluation Logic:** Compares the "Current State" (from Analyzers) vs the "Requirement" (from Policy).
- **Evidence Ledger:** Every check result is stored in an immutable `audit_ledger` table with a cryptographic signature.

### 4. Northbound Interface (The Proof)
Turns raw execution data into user value.
- **Continuous Compliance Dashboard:** Real-time visualization of "Post-Mitigation Residual Risk."
- **Automated Evidence Bundle:** One-click generation of ISO/NIST evidence packages for auditors.
- **Auto-Remediation (Optional):** If a check fails, the Harness can trigger a "Fixer" (e.g., a Terraform Plan or a Lambda function).

## Data Model (New Entities)
- `harness_jobs`: Tracks specific execution runs.
- `harness_connectors`: Configurations for external integrations (AWS, GitHub, etc.).
- `harness_results`: The outcome of checks, linked back to `threat_model.threats`.
- `audit_ledger`: The immutable record of all validations.

## Implementation Tasks
- [ ] **Task 1: Define the Connector Interface** → Create a standard class structure for Analyzers.
- [ ] **Task 2: Build the Infrastructure Snapshot API** → A route that triggers a fetch of real environment data.
- [ ] **Task 3: Map Threats to Checks** → Create a lookup table linking STRIDE threats to specific automation scripts.
- [ ] **Task 4: Implement the Evidence Signer** → A utility to sign results using a secure KMS key.
- [ ] **Task 5: Dashboard Integration** → Add a "Status" badge to the Threat Table that shows the results of the latest Harness run.
