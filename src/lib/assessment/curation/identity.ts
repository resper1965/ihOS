// The bridge between our framework codes and the vendor's.
//
// Our slugs — iso27001, soc2, BR-LGPD — address nothing on the vendor's side.
// The join lives in framework_identity_curation, written by a person, and this
// is the only place that reads it. Two callers need it: the framework
// projection and the DefectDojo resolver.
//
// It throws rather than returning null on purpose. A null would flow downstream
// and turn into a zero, and a framework nobody has decided about is not a
// framework at zero percent.

export interface CurationReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export async function resolveVendorFrameworkCode(
  localFrameworkCode: string,
  client: CurationReader,
): Promise<string> {
  const { data, error } = await client
    .from('framework_identity_curation')
    .select('vendor_framework_code, confidence')
    .eq('local_code', localFrameworkCode)
    .maybeSingle();

  if (error) {
    throw new Error(`framework_identity_curation: ${error.message}`);
  }

  const vendorCode = data?.vendor_framework_code;
  if (typeof vendorCode !== 'string' || vendorCode.length === 0) {
    throw new Error(
      `no curated vendor framework for "${localFrameworkCode}" ` +
        `(confidence: ${String(data?.confidence ?? 'no row')}). ` +
        `A person must decide which of the vendor's frameworks this means.`,
    );
  }

  return vendorCode;
}
