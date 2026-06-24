from api.core.models import (
    ArchitectureModel, Element, DataFlow, EntityType, BoundaryType
)

def get_ncommand_lite_model() -> ArchitectureModel:
    """Instantiates the nCommand Lite architecture model programmatically."""
    
    # Elements
    remote_tech = Element(
        id="E1", name="Remote Technologist", 
        entity_type=EntityType.ACTOR, boundary=BoundaryType.INTERNET
    )
    
    local_tech = Element(
        id="E2", name="Local Technologist", 
        entity_type=EntityType.ACTOR, boundary=BoundaryType.HOSPITAL_NETWORK
    )
    
    azure_ad = Element(
        id="E3", name="Azure AD B2C", 
        entity_type=EntityType.PROCESS, boundary=BoundaryType.INTERNET,
        description="Identity Provider"
    )
    
    web_client = Element(
        id="E4", name="Web Browser App", 
        entity_type=EntityType.PROCESS, boundary=BoundaryType.INTERNET
    )
    
    cloud_signaling = Element(
        id="E5", name="Cloud Signaling Server", 
        entity_type=EntityType.PROCESS, boundary=BoundaryType.CLOUD
    )
    
    ekvm = Element(
        id="E6", name="e-KVM Device", 
        entity_type=EntityType.PROCESS, boundary=BoundaryType.HOSPITAL_NETWORK
    )
    
    scanner = Element(
        id="E7", name="Medical Scanner (MRI/CT)", 
        entity_type=EntityType.PROCESS, boundary=BoundaryType.HOSPITAL_NETWORK
    )
    
    vonage_api = Element(
        id="E8", name="Vonage Video API", 
        entity_type=EntityType.PROCESS, boundary=BoundaryType.CLOUD
    )
    
    # Data Flows
    auth_flow = DataFlow(
        id="F1", name="Authentication",
        source_id="E1", target_id="E3",
        protocol="HTTPS", is_encrypted=True,
        data_elements=["Credentials", "Token"],
        has_mfa=True # Based on SAD recommendations
    )
    
    signaling_flow = DataFlow(
        id="F2", name="WebSocket Signaling",
        source_id="E4", target_id="E5",
        protocol="WSS", is_encrypted=True,
        data_elements=["Connection Metadata"]
    )
    
    p2p_flow = DataFlow(
        id="F3", name="P2P KVM and Video Stream",
        source_id="E4", target_id="E6",
        protocol="UDP", is_encrypted=True, # DTLS
        data_elements=["PHI", "KVM Control Inputs"]
    )
    
    video_chat_flow = DataFlow(
        id="F4", name="Webcam Stream",
        source_id="E4", target_id="E8",
        protocol="HTTPS", is_encrypted=True,
        data_elements=["Video", "Audio"]
    )
    
    local_control_flow = DataFlow(
        id="F5", name="Hardware Access Override",
        source_id="E2", target_id="E6",
        protocol="Local/Hardware", is_encrypted=True,
        data_elements=["Revoke Command"]
    )

    return ArchitectureModel(
        name="nCommand Lite v2.2.x",
        description="Remote medical imaging operation system with P2P DTLS and Azure AD B2C.",
        elements=[remote_tech, local_tech, azure_ad, web_client, cloud_signaling, ekvm, scanner, vonage_api],
        data_flows=[auth_flow, signaling_flow, p2p_flow, video_chat_flow, local_control_flow]
    )
