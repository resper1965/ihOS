from typing import Dict, Any
from api.core.ncommand_model import get_ncommand_lite_model
from api.engine.stride_engine import STRIDEEngine
from api.engine.fmea_calculator import FMEACalculator
from api.integrations.standard_client import StandardAPIClient

class ThreatEvaluator:
    def __init__(self):
        self.client = StandardAPIClient()
    
    def run_full_evaluation(self) -> Dict[str, Any]:
        # 1. Generate Architecture Threats
        model = get_ncommand_lite_model()
        engine = STRIDEEngine(model)
        threats = engine.evaluate()
        
        # 2. Rank threats via FMEA
        fmea_results = FMEACalculator.evaluate_threats(threats)
        
        # 3. Enrich top threats using Standard API
        enriched_threats = []
        # Enrich only top 3 critical/high threats to save time in evaluation
        for idx, threat_data in enumerate(fmea_results["threats"]):
            if idx < 3 and threat_data["qualitative_risk"] in ["CRITICAL", "HIGH"]:
                # Translate Risk
                translation = self.client.translate_risk(
                    technical_description=threat_data["description"]
                )
                
                # Evaluate Evidence (Mitigation)
                mitigation_eval = None
                if threat_data.get("mitigation"):
                    mitigation_eval = self.client.evaluate_evidence(
                        control_requirement=f"Protect against {threat_data['threat_type']}",
                        evidence_description=threat_data["mitigation"]
                    )
                
                threat_data["executive_translation"] = translation
                threat_data["mitigation_validation"] = mitigation_eval
            
            enriched_threats.append(threat_data)
            
        fmea_results["threats"] = enriched_threats
        return fmea_results
