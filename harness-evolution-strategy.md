# Harness Evolution Strategy (ihOS)

## Goal
Transform ihOS from a compliance management platform into an **Automated Execution Harness** that actively validates security controls and orchestrates remediation.

## What is a "Harness" in this context?
A harness is the infrastructure that allows compliance rules (Policy-as-Code) to be **executed** against real environments, rather than just documented in a static report. It delivers **Continuous Proof** to the organization.

## Tasks
- [ ] **Define the Execution Primitive** → Create a `jobs` table to track automated compliance check executions.
- [ ] **Implement 'Policy-as-Code' Engine** → Integrate a runner (e.g., OPA or custom TypeScript agents) to evaluate rules against environment snapshots.
- [ ] **Connectivity Layer (Southbound)** → Build connectors for AWS/Azure and GitHub to fetch real-time state for validation.
- [ ] **Automated Evidence Ledger** → Implement an immutable log of check results (SOT - Source of Truth) to serve as audit evidence.
- [ ] **Remediation Orchestration** → Add a "Remediate" button that triggers GitHub Actions or Webhooks to fix non-compliant states.
- [ ] **Agentic Control Plane** → Enable AI agents to select and run these jobs autonomously based on the Threat Model.

## What it delivers to the "Entity":
1. **Real-time Posture:** No more "audit window" anxiety; compliance is known every minute.
2. **Evidence-as-a-Service:** Automated collection of logs, screenshots, and configs for auditors.
3. **Zero-Touch Remediation:** Identify a gap and fix it via the platform without leaving the UI.
4. **Operational Efficiency:** Redirects security engineers from "spreadsheet filling" to "rule writing."

## Done When
- [ ] A user can trigger a "Live Check" on a threat model item and see the pass/fail result based on real data.
- [ ] The platform automatically generates a signed PDF evidence bundle for a specific framework (e.g., ISO 27001).
