import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testInsert() {
  const { data, error } = await supabase
    .from('compliance_documents')
    .insert({
      filename: 'test.pdf',
      filepath: 'test/test.pdf',
      doc_type: 'pdf',
      category: 'ISMS_CORE',
      title: 'test',
      status: 'draft',
      clarity_report: { status: 'UNCLEAR', issues: [] }
    } as any)
    .select('id');

  if (error) {
    console.error('Insert Error:', error);
  } else {
    console.log('Success:', data);
    
    // cleanup
    await supabase.from('compliance_documents').delete().eq('id', data[0].id);
  }
}

testInsert();
