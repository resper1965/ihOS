from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class EntityType(str, Enum):
    ACTOR = "ACTOR"
    PROCESS = "PROCESS"
    DATA_STORE = "DATA_STORE"
    BOUNDARY = "BOUNDARY"

class BoundaryType(str, Enum):
    INTERNET = "INTERNET"
    CLOUD = "CLOUD"
    HOSPITAL_NETWORK = "HOSPITAL_NETWORK"

class Element(BaseModel):
    id: str
    name: str
    entity_type: EntityType
    boundary: Optional[BoundaryType] = None
    description: str = ""

class DataFlow(BaseModel):
    id: str
    name: str
    source_id: str
    target_id: str
    protocol: str
    is_encrypted: bool
    data_elements: List[str] = Field(default_factory=list)
    has_mfa: bool = False

class ThreatType(str, Enum):
    SPOOFING = "SPOOFING"
    TAMPERING = "TAMPERING"
    REPUDIATION = "REPUDIATION"
    INFORMATION_DISCLOSURE = "INFORMATION_DISCLOSURE"
    DENIAL_OF_SERVICE = "DENIAL_OF_SERVICE"
    ELEVATION_OF_PRIVILEGE = "ELEVATION_OF_PRIVILEGE"

class Threat(BaseModel):
    id: str
    threat_type: ThreatType
    title: str
    description: str
    affected_element_id: str
    mitigation: Optional[str] = None
    severity: int = 1
    occurrence: int = 1
    detection: int = 1
    
    @property
    def rpn(self) -> int:
        """Risk Priority Number (RPN) = Severity x Occurrence x Detection"""
        return self.severity * self.occurrence * self.detection

class ArchitectureModel(BaseModel):
    name: str
    description: str
    elements: List[Element] = Field(default_factory=list)
    data_flows: List[DataFlow] = Field(default_factory=list)
