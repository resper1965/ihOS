import os
import requests
from typing import Dict, Any, List

class StandardAPIClient:
    """Client for standard-api.bekaa.eu used for Threat Model Evaluation."""
    
    BASE_URL = "https://standard-api.bekaa.eu/api/v1"
    
    def __init__(self, api_key: str = None, tenant_id: str = None):
        # Fallbacks to the known working live key from existing scripts
        self.api_key = api_key or os.getenv("STANDARD_API_KEY", "standard_live_ac466fee12964728a6da8a6fe759ff667f5a9a959dc64b3ea3f3e03fbd1c9f35")
        self.tenant_id = tenant_id or os.getenv("STANDARD_TENANT_ID", "00000001-0000-0000-0000-000000000001")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "x-standard-tenant-id": self.tenant_id,
            "Content-Type": "application/json"
        }

    def evaluate_evidence(self, control_requirement: str, evidence_description: str) -> Dict[str, Any]:
        """Calls /gap/evaluate-evidence to validate if a mitigation is sufficient."""
        url = f"{self.BASE_URL}/gap/evaluate-evidence"
        payload = {
            "controlRequirement": control_requirement,
            "evidenceDescription": evidence_description
        }
        try:
            response = requests.post(url, headers=self.headers, json=payload, timeout=10)
            if response.status_code == 200:
                return response.json().get("data", response.json())
            return {"error": f"API Error: {response.status_code}", "raw": response.text}
        except Exception as e:
            return {"error": str(e)}

    def translate_risk(self, technical_description: str, risk_category: str = "security") -> Dict[str, Any]:
        """Calls /executive/translate-risk to calculate business impact of a threat."""
        url = f"{self.BASE_URL}/executive/translate-risk"
        payload = {
            "technicalRiskDescription": technical_description,
            "riskCategory": risk_category,
            "businessContext": "nCommand Lite is an IEC 62304 medical device software. Used by healthcare providers for remote MRI/CT operation."
        }
        try:
            response = requests.post(url, headers=self.headers, json=payload, timeout=20)
            if response.status_code == 200:
                return response.json().get("data", response.json())
            return {"error": f"API Error: {response.status_code}", "raw": response.text}
        except Exception as e:
            return {"error": str(e)}
