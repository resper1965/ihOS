import 'dotenv/config';
import { createAdminClient } from '../lib/supabase/admin';

async function runReindex() {
  const admin = createAdminClient();
  const { data: docs, error } = await admin
    .from('compliance_documents')
    .select('id, title')
    .neq('title', 'TEST_ISMS_POLICY_MD') // Pular o teste que acabei de fazer
    .limit(5); // Processar os 5 primeiros para segurança inicial

  if (error) {
    console.error('Error fetching documents:', error);
    return;
  }

  console.log(`Found ${docs?.length} documents to reindex.`);

  for (const doc of docs || []) {
    console.log(`\n--- Reindexing Document: [${doc.id}] ${doc.title} ---`);
    try {
      // Usar a URL local para o reindex (ou disparar diretamente a lógica se possível)
      // Como estamos em script, o mais seguro é disparar a lógica interna para evitar timeouts de HTTP
      // mas a rota já tem toda a orquestração. Vamos disparar via fetch local.
      
      const response = await fetch(`http://localhost:3000/api/documents/${doc.id}/reindex`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Alguma forma de bypass ou rodar a lógica direto
        }
      });
      
      const result = await response.json();
      console.log(`Result:`, result);
    } catch (err) {
      console.error(`Failed to reindex ${doc.id}:`, err);
    }
  }
}

// Para ser mais robusto, vamos importar a lógica da rota se possível, 
// mas o fetch local é mais simples se o servidor estiver rodando.
// Se o servidor NÃO estiver rodando, vamos rodar a lógica diretamente:
runReindex().catch(console.error);
