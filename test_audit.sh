#!/bin/bash
# Test the audit endpoint
SECRET="ihos-audit-secret-2026-ncommand-lite-production-key"
echo "Sending to http://localhost:3000/api/assessments/audit"
echo "Secret length: ${#SECRET}"
curl -s -X POST http://localhost:3000/api/assessments/audit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SECRET}" \
  -d '{"frameworks": ["iso27001"], "mode": "quick"}'
echo ""
echo "Done"
