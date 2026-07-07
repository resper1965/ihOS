import { createClient } from "@/lib/supabase/server";
import { getFrameworkScores, getTopGaps } from "@/lib/data/compliance-data";
import { getObservedPosture } from "@/lib/posture/observed-status";

export async function buildPostureProfile(productVersionId: string | undefined): Promise<string> {
  if (!productVersionId) {
    return `\n\n## [NCOMMAND LITE POSTURE PROFILE]\nNo specific product version provided. Assuming latest global context.`;
  }

  try {
    const supabase = await createClient();

    // 1. Fetch active version details
    const { data: activeVersion, error: versionErr } = await supabase
      .from("product_versions")
      .select("*")
      .eq("id", productVersionId)
      .single();

    if (versionErr || !activeVersion) {
      console.warn("[Posture Profile] Error fetching active version:", versionErr);
      return `\n\n## [NCOMMAND LITE POSTURE PROFILE]\nUnable to retrieve posture data for the selected version.`;
    }

    // 2. Fetch the previous version chronologically
    const { data: previousVersionData } = await supabase
      .from("product_versions")
      .select("*")
      .lt("created_at", activeVersion.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const previousVersion = previousVersionData;

    // 3. Fetch explicit deltas if available
    const { data: deltas } = await supabase
      .from("product_version_deltas")
      .select("*")
      .eq("product_version_id", productVersionId);

    // 4. Fetch current compliance scores & top gaps
    const frameworkScores = await getFrameworkScores();
    const isoScore = frameworkScores.find((f) => f.code === "iso27001");
    
    // We only fetch global top gaps since compliance-data.ts doesn't filter by version currently,
    // but in a fully mature system it would.
    const topGaps = await getTopGaps();

    // 5. Assemble the Posture Profile String
    let profile = `\n\n## [NCOMMAND LITE POSTURE PROFILE]\n`;
    profile += `You are currently analyzing NCommand Lite **Version ${activeVersion.version_code}**.\n\n`;

    if (previousVersion) {
      profile += `### Delta vs Previous Version (${previousVersion.version_code})\n`;
      if (deltas && deltas.length > 0) {
        profile += `The following architectural/posture changes occurred in this version:\n`;
        deltas.forEach((delta) => {
          profile += `- [${delta.risk_level.toUpperCase()}] ${delta.feature_slug}: ${delta.description}\n`;
        });
      } else {
        profile += `No explicit technical deltas were registered in the database for this transition.\n`;
      }
    } else {
      profile += `*This appears to be the baseline (first) version of the product recorded.*\n`;
    }

    profile += `\n### Current Compliance Posture\n`;
    if (isoScore && isoScore.score !== null) {
      profile += `- **ISO 27001 Score**: ${isoScore.score}%\n`;
      profile += `- **Conforming Controls**: ${isoScore.conformingCount}\n`;
      profile += `- **Identified Gaps**: ${isoScore.gapCount}\n`;
    } else {
      profile += `- No ISO 27001 assessment data found.\n`;
    }

    if (topGaps && topGaps.length > 0) {
      profile += `\n**Top Critical/High Gaps:**\n`;
      topGaps.slice(0, 3).forEach((gap) => {
        profile += `- [${gap.status.toUpperCase()}] ${gap.code} (${gap.domain}): ${gap.name}\n`;
      });
    }

    // Analytical axis: runtime signals (DefectDojo) observed against SCF
    // controls. Shown NEXT TO the documental posture, never replacing it.
    const observed = await getObservedPosture(supabase, productVersionId);
    if (observed.violated.length > 0 || observed.degraded.length > 0) {
      profile += `\n### Observed Runtime Posture (analytical axis)\n`;
      profile += `Live security findings currently contradict or degrade the documented posture:\n`;
      observed.violated.slice(0, 5).forEach((v) => {
        profile += `- [VIOLATED] ${v.scfControlCode}: ${v.criticalOrHigh} active Critical/High finding(s)\n`;
      });
      observed.degraded.slice(0, 3).forEach((d) => {
        profile += `- [DEGRADED] ${d.scfControlCode}: ${d.activeSignals} active lower-severity or risk-accepted finding(s)\n`;
      });
      if (observed.lastSyncedAt) {
        profile += `_Signals last synced: ${observed.lastSyncedAt}_\n`;
      }
      profile += `When answering about these controls, present BOTH views: the documented status AND the observed runtime exposure.\n`;
    }

    profile += `\n*Instruction: Use this profile to accurately answer questions about the current state of NCommand Lite without asking the user for this context.*`;

    return profile;
  } catch (err) {
    console.warn("[Posture Profile] Unexpected error:", err);
    return `\n\n## [NCOMMAND LITE POSTURE PROFILE]\nFailed to assemble full posture profile due to an internal error.`;
  }
}
