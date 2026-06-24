import uuid
from typing import List
from api.core.models import ArchitectureModel, Threat, ThreatType

class STRIDEEngine:
    """Infers STRIDE threats based on architectural patterns."""
    
    def __init__(self, model: ArchitectureModel):
        self.model = model
        self.elements_by_id = {e.id: e for e in model.elements}
        self.threats: List[Threat] = []

    def evaluate(self) -> List[Threat]:
        self.threats = []
        self._evaluate_spoofing()
        self._evaluate_tampering_and_disclosure()
        self._evaluate_repudiation()
        self._evaluate_dos()
        self._evaluate_eop()
        return self.threats

    def _evaluate_spoofing(self):
        # Look for authentication flows
        for flow in self.model.data_flows:
            target = self.elements_by_id.get(flow.target_id)
            if target and target.name == "Azure AD B2C":
                mitigation = "MFA is required." if flow.has_mfa else None
                self.threats.append(Threat(
                    id=str(uuid.uuid4()),
                    threat_type=ThreatType.SPOOFING,
                    title=f"Spoofing of {self.elements_by_id[flow.source_id].name}",
                    description="An attacker may compromise credentials to spoof the remote operator.",
                    affected_element_id=flow.target_id,
                    mitigation=mitigation,
                    severity=9,
                    occurrence=4 if not flow.has_mfa else 2,
                    detection=4
                ))

    def _evaluate_tampering_and_disclosure(self):
        # Look for flows carrying sensitive data over network boundaries
        for flow in self.model.data_flows:
            source = self.elements_by_id.get(flow.source_id)
            target = self.elements_by_id.get(flow.target_id)
            
            if "PHI" in flow.data_elements or "KVM Control Inputs" in flow.data_elements:
                # Information Disclosure
                self.threats.append(Threat(
                    id=str(uuid.uuid4()),
                    threat_type=ThreatType.INFORMATION_DISCLOSURE,
                    title=f"Interception of {flow.name}",
                    description=f"Attacker intercepts sensitive data between {source.name} and {target.name}.",
                    affected_element_id=flow.id,
                    mitigation="E2EE via DTLS/TLS" if flow.is_encrypted else None,
                    severity=10,
                    occurrence=2 if flow.is_encrypted else 8,
                    detection=8
                ))
                
                # Tampering
                self.threats.append(Threat(
                    id=str(uuid.uuid4()),
                    threat_type=ThreatType.TAMPERING,
                    title=f"Injection/Tampering of {flow.name}",
                    description=f"Attacker modifies KVM inputs or video stream.",
                    affected_element_id=flow.id,
                    mitigation="DTLS integrity checks" if flow.is_encrypted else None,
                    severity=10,
                    occurrence=2 if flow.is_encrypted else 6,
                    detection=5
                ))

    def _evaluate_repudiation(self):
        # Lack of non-repudiation for hardware access
        for flow in self.model.data_flows:
            if "KVM Control Inputs" in flow.data_elements:
                self.threats.append(Threat(
                    id=str(uuid.uuid4()),
                    threat_type=ThreatType.REPUDIATION,
                    title="Repudiation of Medical Scanner Actions",
                    description="Remote operator performs an action but denies it later.",
                    affected_element_id=flow.target_id,
                    mitigation="Immutable audit logging of sessions.",
                    severity=6,
                    occurrence=4,
                    detection=7
                ))

    def _evaluate_dos(self):
        # DoS on cloud signaling
        for el in self.model.elements:
            if el.name == "Cloud Signaling Server":
                self.threats.append(Threat(
                    id=str(uuid.uuid4()),
                    threat_type=ThreatType.DENIAL_OF_SERVICE,
                    title=f"DDoS on {el.name}",
                    description="Attacker floods signaling server to prevent connection establishment.",
                    affected_element_id=el.id,
                    mitigation="Cloud scalability, rate limiting.",
                    severity=7,
                    occurrence=5,
                    detection=2
                ))

    def _evaluate_eop(self):
        # Elevation of Privilege - locking out local tech
        self.threats.append(Threat(
            id=str(uuid.uuid4()),
            threat_type=ThreatType.ELEVATION_OF_PRIVILEGE,
            title="Bypass of Local Control",
            description="Remote tech attempts to bypass revocation commands from Local Tech.",
            affected_element_id="E6", # e-KVM
            mitigation="Hardware-level interrupt prioritized for local tech.",
            severity=8,
            occurrence=2,
            detection=3
        ))
