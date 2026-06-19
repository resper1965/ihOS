#!/bin/bash
curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer standard_live_ac466fee12964728a6da8a6fe759ff667f5a9a959dc64b3ea3f3e03fbd1c9f35" \
  -H "Accept: application/json" \
  "https://standard-api.bekaa.eu/api/v1/scf/versions/latest"
