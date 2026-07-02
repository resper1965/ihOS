# Threat Modeling Guide — ihOS

Este guia documenta o processo de modelagem de ameaças (STRIDE + FMEA) e os **documentos mínimos necessários** que devem estar indexados e associados à versão do produto no RAG para garantir análises precisas e sem erros.

---

## 📋 Documentos Mínimos Necessários

O motor de RAG (GRC Engine) analisa a documentação técnica e regulatória para projetar as ameaças e propor mitigações. Sem os documentos abaixo associados ao escopo do produto, a IA gerará resultados genéricos ou incompletos.

| Documento | Identificadores no Nome do Arquivo | Função no Threat Model | Obrigatoriedade |
| :--- | :--- | :--- | :---: |
| **SAD (Solution Architecture)** | `SAD`, `Architecture`, `Arquitetura` | Detalha a topologia do sistema, componentes, limites de confiança (trust boundaries) e fluxos de dados. Essencial para identificar ameaças **STRIDE** (ex: Spoofing, Tampering). | **Obrigatório 🚨** |
| **SRS/SDS (Requirements/Design)** | `SRS`, `SDS`, `Requirements`, `Requisitos` | Define os requisitos não-funcionais (criptografia, autenticação, controle de acesso) usados para verificar se as ameaças já possuem mitigações nativas. | **Obrigatório 🚨** |
| **Políticas de TI/Infraestrutura** | `PSI`, `Infra`, `IT`, `TI`, `Operação` | Descreve as defesas de rede, backups, controle de logs e firewalls. Usado para calcular a severidade e detecção na matriz **FMEA**. | **Recomendado ⚠️** |
| **Privacidade e Governança (DPA)** | `PDPA`, `DPA`, `LGPD`, `GDPR`, `EULA` | Detalha os termos de privacidade, consentimento e transferência de dados para identificar brechas de conformidade regulatória. | **Recomendado ⚠️** |

---

## 🚀 Como Executar o Threat Modeling

### Passo 1: Upload e Associação dos Documentos
1. Vá até a tela de **Documents** (no menu lateral).
2. Clique em **Upload Document**.
3. No Passo 1 do assistente, sob **Application Scope**, selecione **Technical Specification** e selecione a versão correspondente do produto (ex: `nCommand Lite v2.2.x`).
4. Conclua o upload do arquivo (`SAD`, `SRS`, etc.).

> [!NOTE]
> Você também pode mudar a versão de um documento existente diretamente na tabela da página de documentos, utilizando o dropdown na linha do arquivo.

### Passo 2: Geração do Threat Model
1. Vá até a tela de **Threat Modeling**.
2. Clique em **New Threat Model** para abrir o assistente.
3. Selecione a versão desejada do produto (ex: `v2.2.x`). O sistema exibirá o total de documentos disponíveis para aquela versão (globais + específicos) e um **checklist de verificação** dos documentos mínimos.
4. Selecione os frameworks de conformidade alvo (ex: *ISO 27001*, *LGPD*).
5. Clique em **Generate Threat Model** e aguarde o processamento do motor GRC (pode levar de 2 a 5 minutos).

---

## 🔍 Regras de Resolução do RAG (Isolamento de Escopo)
Ao realizar a consulta semântica para construir a análise de risco, o banco de dados executa a função híbrida selecionando apenas:
1. Documentos cujo campo `product_version_id` seja **nulo** (Políticas Globais).
2. Documentos cujo campo `product_version_id` corresponda ao **UUID da versão selecionada**.

Arquivos associados a outras versões do produto são totalmente isolados e desconsiderados para evitar conflitos de arquitetura.

---

## ♻️ Reuso da Análise Acumulada (Minimização de API)

O motor GRC externo (ihos-api) é caro para chamar a cada geração. Para evitar reprocessamento desnecessário:

1. A cada upload/reindexação de documento de versão, o pipeline extrai **deltas técnicos** (novas features/integrações) para `product_version_deltas` (ver `src/lib/assessment/delta-extractor.ts`).
2. `POST /api/threat-modeling` calcula um *fingerprint* desses deltas acumulados (`getDeltaFingerprint`) e o compara com o fingerprint gravado na última análise salva para a mesma versão + conjunto de frameworks.
3. **Se nada mudou**, a última análise persistida é devolvida (`cached: true`) — o motor GRC **não** é chamado novamente.
4. **Se houve mudança** (nova feature extraída), o motor é chamado normalmente e o novo fingerprint é gravado.
5. Para forçar uma nova geração mesmo sem deltas novos, envie `force_reevaluate: true` no corpo da requisição.

### 🚫 Sem Invenção de Ameaças

Se o motor GRC externo falhar (indisponível, erro 5xx, timeout), a API **não** gera dados fictícios. Ela responde com `502` e `{ "error": "GRC_ENGINE_UNAVAILABLE" }`, indicando que a lacuna deve ser resolvida na API externa. Nenhum registro é salvo em `threat_models` nesse caso.

Se a versão do produto não possuir nenhum delta extraído (`product_version_deltas` vazio), a análise ainda é gerada, mas o campo `limitations` da resposta traz um aviso explícito de que a cobertura por feature pode estar incompleta — nunca é omitido silenciosamente.
