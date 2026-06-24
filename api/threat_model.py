from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from api.engine.threat_evaluator import ThreatEvaluator

app = FastAPI(
    title="Threat Modeling ASPM API",
    description="ASPM Engine for evaluating STRIDE architectures and enriching with Standard GRC API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/threat_model/health")
def health_check():
    return {"status": "healthy", "service": "threat-modeling-aspm"}

@app.post("/api/threat_model")
def evaluate_threat_model():
    """
    Evaluates the predefined nCommand Lite architecture, infers STRIDE threats,
    calculates FMEA scores, and enriches the top risks via the Standard GRC API.
    """
    try:
        evaluator = ThreatEvaluator()
        result = evaluator.run_full_evaluation()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
