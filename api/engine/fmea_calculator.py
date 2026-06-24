from typing import List, Dict
from api.core.models import Threat

class FMEACalculator:
    """Evaluates and ranks threats based on FMEA logic."""
    
    @staticmethod
    def evaluate_threats(threats: List[Threat]) -> Dict[str, any]:
        """Calculates RPN and ranks threats by severity/rpn."""
        ranked = sorted(threats, key=lambda t: t.rpn, reverse=True)
        
        results = []
        for t in ranked:
            qualitative = "CRITICAL" if t.rpn >= 150 else ("HIGH" if t.rpn >= 100 else ("MEDIUM" if t.rpn >= 50 else "LOW"))
            results.append({
                "id": t.id,
                "title": t.title,
                "threat_type": t.threat_type.value,
                "rpn": t.rpn,
                "qualitative_risk": qualitative,
                "mitigation": t.mitigation,
                "description": t.description
            })
            
        return {
            "total_threats": len(threats),
            "critical_count": sum(1 for r in results if r["qualitative_risk"] == "CRITICAL"),
            "high_count": sum(1 for r in results if r["qualitative_risk"] == "HIGH"),
            "threats": results
        }
