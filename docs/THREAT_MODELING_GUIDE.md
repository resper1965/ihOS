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
