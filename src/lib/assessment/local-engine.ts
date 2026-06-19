import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbedding } from '@/lib/chat/embeddings';
import type {
  AssessmentConfig,
  AssessmentResult,
  ControlEvaluation,
  FrameworkScore,
  ProgressCallback,
} from './engine';

// ---------------------------------------------------------------------------
// ISO 27001:2022 Annex A Controls (93 controls, 4 themes)
// These are public standard requirements — NOT proprietary.
// ---------------------------------------------------------------------------

interface AnnexAControl {
  id: string;
  name: string;
  domain: string; // A.5–A.8
  description: string;
}

const ISO27001_ANNEX_A: AnnexAControl[] = [
  // A.5 — Organizational controls (37)
  { id: 'A.5.1', name: 'Policies for information security', domain: 'A.5', description: 'Information security policy and topic-specific policies shall be defined, approved by management, published, communicated to relevant personnel.' },
  { id: 'A.5.2', name: 'Information security roles and responsibilities', domain: 'A.5', description: 'Information security roles and responsibilities shall be defined and allocated.' },
  { id: 'A.5.3', name: 'Segregation of duties', domain: 'A.5', description: 'Conflicting duties and conflicting areas of responsibility shall be segregated.' },
  { id: 'A.5.4', name: 'Management responsibilities', domain: 'A.5', description: 'Management shall require all personnel to apply information security in accordance with the established policies.' },
  { id: 'A.5.5', name: 'Contact with authorities', domain: 'A.5', description: 'The organization shall establish and maintain contact with relevant authorities.' },
  { id: 'A.5.6', name: 'Contact with special interest groups', domain: 'A.5', description: 'The organization shall establish and maintain contact with special interest groups or security forums.' },
  { id: 'A.5.7', name: 'Threat intelligence', domain: 'A.5', description: 'Information relating to information security threats shall be collected and analysed to produce threat intelligence.' },
  { id: 'A.5.8', name: 'Information security in project management', domain: 'A.5', description: 'Information security shall be integrated into project management.' },
  { id: 'A.5.9', name: 'Inventory of information and other associated assets', domain: 'A.5', description: 'An inventory of information and other associated assets shall be developed and maintained.' },
  { id: 'A.5.10', name: 'Acceptable use of information and other associated assets', domain: 'A.5', description: 'Rules for the acceptable use of information and other associated assets shall be identified, documented and implemented.' },
  { id: 'A.5.11', name: 'Return of assets', domain: 'A.5', description: 'Personnel and other interested parties shall return all organizational assets in their possession upon change or termination.' },
  { id: 'A.5.12', name: 'Classification of information', domain: 'A.5', description: 'Information shall be classified according to the information security needs of the organization.' },
  { id: 'A.5.13', name: 'Labelling of information', domain: 'A.5', description: 'An appropriate set of procedures for information labelling shall be developed and implemented.' },
  { id: 'A.5.14', name: 'Information transfer', domain: 'A.5', description: 'Information transfer rules, procedures or agreements shall exist for all types of transfer facilities.' },
  { id: 'A.5.15', name: 'Access control', domain: 'A.5', description: 'Rules to control physical and logical access to information and other associated assets shall be established and implemented.' },
  { id: 'A.5.16', name: 'Identity management', domain: 'A.5', description: 'The full life cycle of identities shall be managed.' },
  { id: 'A.5.17', name: 'Authentication information', domain: 'A.5', description: 'Allocation and management of authentication information shall be controlled by a management process.' },
  { id: 'A.5.18', name: 'Access rights', domain: 'A.5', description: 'Access rights to information and other associated assets shall be provisioned, reviewed, modified and removed.' },
  { id: 'A.5.19', name: 'Information security in supplier relationships', domain: 'A.5', description: 'Processes and procedures shall be defined and implemented to manage the information security risks associated with the use of supplier products or services.' },
  { id: 'A.5.20', name: 'Addressing information security within supplier agreements', domain: 'A.5', description: 'Relevant information security requirements shall be established and agreed with each supplier.' },
  { id: 'A.5.21', name: 'Managing information security in the ICT supply chain', domain: 'A.5', description: 'Processes and procedures shall be defined and implemented to manage the information security risks associated with the ICT supply chain.' },
  { id: 'A.5.22', name: 'Monitoring, review and change management of supplier services', domain: 'A.5', description: 'The organization shall regularly monitor, review, evaluate and manage change in supplier information security practices and service delivery.' },
  { id: 'A.5.23', name: 'Information security for use of cloud services', domain: 'A.5', description: 'Processes for acquisition, use, management and exit from cloud services shall be established.' },
  { id: 'A.5.24', name: 'Information security incident management planning and preparation', domain: 'A.5', description: 'The organization shall plan and prepare for managing information security incidents.' },
  { id: 'A.5.25', name: 'Assessment and decision on information security events', domain: 'A.5', description: 'The organization shall assess information security events and decide if they are to be categorized as incidents.' },
  { id: 'A.5.26', name: 'Response to information security incidents', domain: 'A.5', description: 'Information security incidents shall be responded to in accordance with the documented procedures.' },
  { id: 'A.5.27', name: 'Learning from information security incidents', domain: 'A.5', description: 'Knowledge gained from information security incidents shall be used to strengthen and improve controls.' },
  { id: 'A.5.28', name: 'Collection of evidence', domain: 'A.5', description: 'The organization shall establish and implement procedures for the identification, collection, acquisition and preservation of evidence related to information security events.' },
  { id: 'A.5.29', name: 'Information security during disruption', domain: 'A.5', description: 'The organization shall plan how to maintain information security at an appropriate level during disruption.' },
  { id: 'A.5.30', name: 'ICT readiness for business continuity', domain: 'A.5', description: 'ICT readiness shall be planned, implemented, maintained and tested based on business continuity objectives.' },
  { id: 'A.5.31', name: 'Legal, statutory, regulatory and contractual requirements', domain: 'A.5', description: 'Legal, statutory, regulatory and contractual requirements relevant to information security shall be identified, documented and kept up to date.' },
  { id: 'A.5.32', name: 'Intellectual property rights', domain: 'A.5', description: 'The organization shall implement appropriate procedures to protect intellectual property rights.' },
  { id: 'A.5.33', name: 'Protection of records', domain: 'A.5', description: 'Records shall be protected from loss, destruction, falsification, unauthorized access and unauthorized release.' },
  { id: 'A.5.34', name: 'Privacy and protection of PII', domain: 'A.5', description: 'The organization shall identify and meet the requirements regarding the preservation of privacy and protection of PII.' },
  { id: 'A.5.35', name: 'Independent review of information security', domain: 'A.5', description: 'The approach to managing information security shall be independently reviewed at planned intervals or when significant changes occur.' },
  { id: 'A.5.36', name: 'Compliance with policies, rules and standards', domain: 'A.5', description: 'Compliance with the information security policy, topic-specific policies, rules and standards shall be regularly reviewed.' },
  { id: 'A.5.37', name: 'Documented operating procedures', domain: 'A.5', description: 'Operating procedures for information processing facilities shall be documented and made available to personnel who need them.' },

  // A.6 — People controls (8)
  { id: 'A.6.1', name: 'Screening', domain: 'A.6', description: 'Background verification checks on all candidates to become personnel shall be carried out prior to joining the organization.' },
  { id: 'A.6.2', name: 'Terms and conditions of employment', domain: 'A.6', description: 'The employment contractual agreements shall state the personnel and organization responsibilities for information security.' },
  { id: 'A.6.3', name: 'Information security awareness, education and training', domain: 'A.6', description: 'Personnel and relevant interested parties shall receive appropriate security awareness education, training and updates.' },
  { id: 'A.6.4', name: 'Disciplinary process', domain: 'A.6', description: 'A disciplinary process shall be formalized and communicated to take actions against personnel who have committed an information security policy violation.' },
  { id: 'A.6.5', name: 'Responsibilities after termination or change of employment', domain: 'A.6', description: 'Information security responsibilities and duties that remain valid after termination or change of employment shall be defined, enforced and communicated.' },
  { id: 'A.6.6', name: 'Confidentiality or non-disclosure agreements', domain: 'A.6', description: 'Confidentiality or non-disclosure agreements reflecting the organization\'s needs for the protection of information shall be identified, documented, reviewed and signed.' },
  { id: 'A.6.7', name: 'Remote working', domain: 'A.6', description: 'Security measures shall be implemented when personnel are working remotely to protect information accessed, processed or stored outside the organization\'s premises.' },
  { id: 'A.6.8', name: 'Information security event reporting', domain: 'A.6', description: 'The organization shall provide a mechanism for personnel to report observed or suspected information security events through appropriate channels.' },

  // A.7 — Physical controls (14)
  { id: 'A.7.1', name: 'Physical security perimeters', domain: 'A.7', description: 'Security perimeters shall be defined and used to protect areas containing information and other associated assets.' },
  { id: 'A.7.2', name: 'Physical entry', domain: 'A.7', description: 'Secure areas shall be protected by appropriate entry controls and access points.' },
  { id: 'A.7.3', name: 'Securing offices, rooms and facilities', domain: 'A.7', description: 'Physical security for offices, rooms and facilities shall be designed and implemented.' },
  { id: 'A.7.4', name: 'Physical security monitoring', domain: 'A.7', description: 'Premises shall be continuously monitored for unauthorized physical access.' },
  { id: 'A.7.5', name: 'Protecting against physical and environmental threats', domain: 'A.7', description: 'Protection against physical and environmental threats such as natural disasters and other intentional or unintentional physical threats shall be designed and implemented.' },
  { id: 'A.7.6', name: 'Working in secure areas', domain: 'A.7', description: 'Security measures for working in secure areas shall be designed and implemented.' },
  { id: 'A.7.7', name: 'Clear desk and clear screen', domain: 'A.7', description: 'Clear desk rules for papers and removable storage media and clear screen rules for information processing facilities shall be defined and enforced.' },
  { id: 'A.7.8', name: 'Equipment siting and protection', domain: 'A.7', description: 'Equipment shall be sited securely and protected.' },
  { id: 'A.7.9', name: 'Security of assets off-premises', domain: 'A.7', description: 'Off-site assets shall be protected.' },
  { id: 'A.7.10', name: 'Storage media', domain: 'A.7', description: 'Storage media shall be managed through their life cycle.' },
  { id: 'A.7.11', name: 'Supporting utilities', domain: 'A.7', description: 'Information processing facilities shall be protected from power failures and other disruptions caused by failures in supporting utilities.' },
  { id: 'A.7.12', name: 'Cabling security', domain: 'A.7', description: 'Cables carrying power, data or supporting information services shall be protected from interception, interference or damage.' },
  { id: 'A.7.13', name: 'Equipment maintenance', domain: 'A.7', description: 'Equipment shall be maintained correctly to ensure availability, integrity and confidentiality of information.' },
  { id: 'A.7.14', name: 'Secure disposal or re-use of equipment', domain: 'A.7', description: 'Items of equipment containing storage media shall be verified to ensure that any sensitive data and licensed software has been removed or securely overwritten prior to disposal or re-use.' },

  // A.8 — Technological controls (34)
  { id: 'A.8.1', name: 'User endpoint devices', domain: 'A.8', description: 'Information stored on, processed by or accessible via user endpoint devices shall be protected.' },
  { id: 'A.8.2', name: 'Privileged access rights', domain: 'A.8', description: 'The allocation and use of privileged access rights shall be restricted and managed.' },
  { id: 'A.8.3', name: 'Information access restriction', domain: 'A.8', description: 'Access to information and other associated assets shall be restricted in accordance with the established topic-specific policy on access control.' },
  { id: 'A.8.4', name: 'Access to source code', domain: 'A.8', description: 'Read and write access to source code, development tools and software libraries shall be appropriately managed.' },
  { id: 'A.8.5', name: 'Secure authentication', domain: 'A.8', description: 'Secure authentication technologies and procedures shall be established and implemented.' },
  { id: 'A.8.6', name: 'Capacity management', domain: 'A.8', description: 'The use of resources shall be monitored and adjusted in line with current and expected capacity requirements.' },
  { id: 'A.8.7', name: 'Protection against malware', domain: 'A.8', description: 'Protection against malware shall be implemented and supported by appropriate user awareness.' },
  { id: 'A.8.8', name: 'Management of technical vulnerabilities', domain: 'A.8', description: 'Information about technical vulnerabilities of information systems shall be obtained, exposure evaluated and appropriate measures taken.' },
  { id: 'A.8.9', name: 'Configuration management', domain: 'A.8', description: 'Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.' },
  { id: 'A.8.10', name: 'Information deletion', domain: 'A.8', description: 'Information stored in information systems, devices or in any other storage media shall be deleted when no longer required.' },
  { id: 'A.8.11', name: 'Data masking', domain: 'A.8', description: 'Data masking shall be used in accordance with the organization\'s topic-specific policy on access control and business requirements.' },
  { id: 'A.8.12', name: 'Data leakage prevention', domain: 'A.8', description: 'Data leakage prevention measures shall be applied to systems, networks and any other devices that process, store or transmit sensitive information.' },
  { id: 'A.8.13', name: 'Information backup', domain: 'A.8', description: 'Backup copies of information, software and systems shall be maintained and regularly tested.' },
  { id: 'A.8.14', name: 'Redundancy of information processing facilities', domain: 'A.8', description: 'Information processing facilities shall be implemented with redundancy sufficient to meet availability requirements.' },
  { id: 'A.8.15', name: 'Logging', domain: 'A.8', description: 'Logs that record activities, exceptions, faults and other relevant events shall be produced, stored, protected and analysed.' },
  { id: 'A.8.16', name: 'Monitoring activities', domain: 'A.8', description: 'Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken.' },
  { id: 'A.8.17', name: 'Clock synchronization', domain: 'A.8', description: 'The clocks of information processing systems shall be synchronized to an approved time source.' },
  { id: 'A.8.18', name: 'Use of privileged utility programs', domain: 'A.8', description: 'The use of utility programs that might be capable of overriding system and application controls shall be restricted and tightly controlled.' },
  { id: 'A.8.19', name: 'Installation of software on operational systems', domain: 'A.8', description: 'Procedures and measures shall be implemented to securely manage software installation on operational systems.' },
  { id: 'A.8.20', name: 'Networks security', domain: 'A.8', description: 'Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.' },
  { id: 'A.8.21', name: 'Security of network services', domain: 'A.8', description: 'Security mechanisms, service levels and service requirements of network services shall be identified, implemented and monitored.' },
  { id: 'A.8.22', name: 'Segregation of networks', domain: 'A.8', description: 'Groups of information services, users and information systems shall be segregated in the organization\'s networks.' },
  { id: 'A.8.23', name: 'Web filtering', domain: 'A.8', description: 'Access to external websites shall be managed to reduce exposure to malicious content.' },
  { id: 'A.8.24', name: 'Use of cryptography', domain: 'A.8', description: 'Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.' },
  { id: 'A.8.25', name: 'Secure development life cycle', domain: 'A.8', description: 'Rules for the secure development of software and systems shall be established and applied.' },
  { id: 'A.8.26', name: 'Application security requirements', domain: 'A.8', description: 'Information security requirements shall be identified, specified and approved when developing or acquiring applications.' },
  { id: 'A.8.27', name: 'Secure system architecture and engineering principles', domain: 'A.8', description: 'Principles for engineering secure systems shall be established, documented, maintained and applied to any information system development activity.' },
  { id: 'A.8.28', name: 'Secure coding', domain: 'A.8', description: 'Secure coding principles shall be applied to software development.' },
  { id: 'A.8.29', name: 'Security testing in development and acceptance', domain: 'A.8', description: 'Security testing processes shall be defined and implemented in the development life cycle.' },
  { id: 'A.8.30', name: 'Outsourced development', domain: 'A.8', description: 'The organization shall direct, monitor and review the activities related to outsourced system development.' },
  { id: 'A.8.31', name: 'Separation of development, test and production environments', domain: 'A.8', description: 'Development, testing and production environments shall be separated and secured.' },
  { id: 'A.8.32', name: 'Change management', domain: 'A.8', description: 'Changes to information processing facilities and information systems shall be subject to change management procedures.' },
  { id: 'A.8.33', name: 'Test information', domain: 'A.8', description: 'Test information shall be appropriately selected, protected and managed.' },
  { id: 'A.8.34', name: 'Protection of information systems during audit testing', domain: 'A.8', description: 'Audit tests and other assurance activities involving assessment of operational systems shall be planned and agreed between the tester and appropriate management.' },
];

// ---------------------------------------------------------------------------
// Confidence thresholds for RAG similarity
// ---------------------------------------------------------------------------
const SIMILARITY_COMPLIANT = 0.72;    // >= this: strong evidence, compliant
const SIMILARITY_PARTIAL = 0.60;      // >= this: partial evidence, needs review
const MATCH_THRESHOLD = 0.30;         // Minimum match threshold for RPC

// ---------------------------------------------------------------------------
// Local Assessment Engine
// ---------------------------------------------------------------------------

export async function runLocalAssessment(
  config: AssessmentConfig,
  onProgress?: ProgressCallback,
): Promise<AssessmentResult> {
  const startedAt = new Date().toISOString();
  const adminSupabase = createAdminClient();

  // Phase 1: Load controls
  const controls = ISO27001_ANNEX_A;
  onProgress?.({
    phase: 'loading_controls',
    current: controls.length,
    total: controls.length,
    message: `Loaded ${controls.length} ISO 27001:2022 Annex A controls.`,
  });

  // Phase 2: Evaluate each control against RAG evidence
  const evaluations: ControlEvaluation[] = [];
  const implementedControlIds: string[] = [];

  for (let i = 0; i < controls.length; i++) {
    const control = controls[i];

    onProgress?.({
      phase: 'evaluating',
      current: i + 1,
      total: controls.length,
      message: `[${control.id}] ${control.name}`,
    });

    try {
      // Generate semantic embedding for this control's description
      const queryEmbedding = await generateEmbedding(control.description);

      // Call RPC via admin client (bypasses RLS and browser auth)
      const { data, error } = await adminSupabase.rpc('match_documents_hybrid', {
        query_text: control.description,
        query_embedding: queryEmbedding,
        match_threshold: MATCH_THRESHOLD,
        match_count: 3,
        filter_framework: null,
        filter_version_id: null,
        filter_categories: null,
      });

      if (error) {
        console.error(`[Audit] RPC error for ${control.id}:`, error.message);
        evaluations.push({
          controlId: control.id,
          controlName: control.name,
          domain: control.domain,
          isCompliant: false,
          confidenceScore: 0,
          auditorNotes: `RAG search failed: ${error.message}`,
        });
        continue;
      }

      if (!data || data.length === 0) {
        evaluations.push({
          controlId: control.id,
          controlName: control.name,
          domain: control.domain,
          isCompliant: false,
          confidenceScore: 0,
          auditorNotes: 'No documentary evidence found in ISMS repository.',
        });
        continue;
      }

      // Take the best match
      const best = data[0] as Record<string, unknown>;
      const similarity = (best.similarity as number) ?? 0;
      let isCompliant = false;
      let auditorNotes: string;
      const docTitle = (best.doc_title as string) ?? (best.doc_filename as string) ?? 'Unknown';

      if (similarity >= SIMILARITY_COMPLIANT) {
        isCompliant = true;
        auditorNotes = `Strong evidence found (similarity: ${(similarity * 100).toFixed(1)}%) in "${docTitle}"`;
      } else if (similarity >= SIMILARITY_PARTIAL) {
        isCompliant = false;
        auditorNotes = `Partial evidence found (similarity: ${(similarity * 100).toFixed(1)}%). May not fully address the requirement. Source: "${docTitle}"`;
      } else {
        isCompliant = false;
        auditorNotes = `Weak evidence found (similarity: ${(similarity * 100).toFixed(1)}%). Tangentially related. Source: "${docTitle}"`;
      }

      const confidenceScore = Math.round(similarity * 100);

      evaluations.push({
        controlId: control.id,
        controlName: control.name,
        domain: control.domain,
        isCompliant,
        confidenceScore,
        evidenceChunkId: best.id as number,
        evidenceSnippet: ((best.content as string) ?? '').slice(0, 300),
        auditorNotes,
      });

      if (isCompliant) {
        implementedControlIds.push(control.id);
      }
    } catch (err) {
      console.error(`[Audit] Error evaluating ${control.id}:`, err instanceof Error ? err.message : err);
      evaluations.push({
        controlId: control.id,
        controlName: control.name,
        domain: control.domain,
        isCompliant: false,
        confidenceScore: 0,
        auditorNotes: `Evaluation error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }

    // Rate limiting: small delay every 10 controls to avoid API throttling
    if (i % 10 === 9) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Phase 3: Calculate scores
  onProgress?.({
    phase: 'scoring',
    current: 0,
    total: config.frameworks.length,
    message: 'Calculating compliance scores...',
  });

  const totalCompliant = evaluations.filter(e => e.isCompliant).length;
  const score = controls.length > 0
    ? Math.round((totalCompliant / controls.length) * 100)
    : 0;

  const frameworkScores: FrameworkScore[] = config.frameworks.map(fwId => ({
    frameworkId: fwId,
    score,
    implementedCount: totalCompliant,
    totalRequired: controls.length,
    missingControls: evaluations
      .filter(e => !e.isCompliant)
      .map(e => e.controlId),
  }));

  // Phase 4: Result
  const completedAt = new Date().toISOString();
  const result: AssessmentResult = {
    id: crypto.randomUUID(),
    startedAt,
    completedAt,
    config,
    controlEvaluations: evaluations,
    frameworkScores,
    implementedControlIds,
    totalControlsEvaluated: evaluations.length,
    totalControlsCompliant: totalCompliant,
    totalControlsMissing: evaluations.length - totalCompliant,
  };

  onProgress?.({
    phase: 'complete',
    current: 1,
    total: 1,
    message: `Assessment complete: ${totalCompliant}/${evaluations.length} controls with evidence (${score}%).`,
  });

  return result;
}

