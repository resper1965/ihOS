import { logger } from '@/lib/logger';
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to fetch available frameworks from the mappings table
    const { data: mappings, error } = await supabase
      .from('scf_framework_mappings')
      .select('framework_code');

    const uniqueCodes = [...new Set(mappings?.map(m => m.framework_code) || [])];
    
    const fallbackNames: Record<string, string> = {
      "iso27001": "ISO/IEC 27001:2022",
      "soc2": "SOC 2 Type II",
      "hipaa": "HIPAA",
      "nist_800_53": "NIST 800-53",
      "nist_csf": "NIST Cybersecurity Framework (CSF)",
      "iso27701": "ISO/IEC 27701:2019",
      "fedramp": "FedRAMP",
      "BR-LGPD": "LGPD (Brazil)",
      "EU-GDPR": "GDPR (European Union)",
      "PCI-DSS": "PCI-DSS v4.0",
      "saudi_sama": "SAMA CSF (Saudi Arabia)",
      "saudi_nca": "NCA ECC (Saudi Arabia)",
      "cis_v8": "CIS Controls v8"
    };

    // Ensure we always return at least this rich set of common frameworks
    const baseCodes = Object.keys(fallbackNames);
    const combinedCodes = [...new Set([...baseCodes, ...uniqueCodes])];

    const frameworks = combinedCodes.map(code => ({
      framework_code: code,
      framework_name: fallbackNames[code] || fallbackNames[code.toLowerCase()] || code
    }));

    return NextResponse.json({
      success: true,
      data: frameworks,
    });
  } catch (error) {
    logger.error("Fetch standard frameworks failed", { context: "compliance/frameworks", error: error });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch standard frameworks",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
