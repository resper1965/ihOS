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
      iso27001: "ISO/IEC 27001:2022",
      soc2: "SOC 2 Type II",
      hipaa: "HIPAA",
      nist_800_53: "NIST 800-53",
      iso27701: "ISO/IEC 27701:2019",
      fedramp: "FedRAMP",
      "BR-LGPD": "LGPD (Brazil)",
      "EU-GDPR": "GDPR (European Union)",
      "PCI-DSS": "PCI-DSS v4.0"
    };

    const frameworks = uniqueCodes.map(code => ({
      framework_code: code,
      framework_name: fallbackNames[code.toLowerCase()] || fallbackNames[code] || code
    }));

    // If for some reason DB is empty or fails, use the default 6
    if (frameworks.length === 0) {
      frameworks.push(
        { framework_code: "iso27001", framework_name: "ISO/IEC 27001:2022" },
        { framework_code: "soc2", framework_name: "SOC 2 Type II" },
        { framework_code: "hipaa", framework_name: "HIPAA" },
        { framework_code: "nist_800_53", framework_name: "NIST 800-53" },
        { framework_code: "iso27701", framework_name: "ISO/IEC 27701:2019" },
        { framework_code: "fedramp", framework_name: "FedRAMP" }
      );
    }

    return NextResponse.json({
      success: true,
      data: frameworks,
    });
  } catch (error) {
    console.error("[API] /compliance/frameworks error:", error);
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
