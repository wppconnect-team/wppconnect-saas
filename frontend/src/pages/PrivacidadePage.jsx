import React from 'react';
import Ic from '../components/icons';

export default function PrivacidadePage({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, overflowY: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-mark" style={{ fontSize: 13 }}>Wpp</div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Wppconnect</span>
          </div>
          <button className="btn secondary" onClick={onClose}>
            <Ic.X style={{ width: 14, height: 14 }}/> Fechar
          </button>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.5px' }}>
          Política de Privacidade
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 40 }}>
          Última atualização: 01 de maio de 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          <Section title="1. Introdução">
            <p>A Wppconnect ("nós", "nosso") está comprometida com a proteção dos seus dados pessoais em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e demais legislações aplicáveis. Esta Política descreve como coletamos, usamos, armazenamos e protegemos suas informações.</p>
          </Section>

          <Section title="2. Dados que Coletamos">
            <p><strong>Dados de cadastro:</strong> nome, e-mail, telefone e informações de pagamento fornecidos durante o registro.</p>
            <p style={{ marginTop: 10 }}><strong>Dados de uso:</strong> páginas acessadas, funcionalidades utilizadas, logs de sessão, endereço IP, tipo de navegador e dispositivo.</p>
            <p style={{ marginTop: 10 }}><strong>Dados de mensagens:</strong> metadados das sessões WhatsApp conectadas (volumes, timestamps, status de entrega). Não armazenamos o conteúdo das mensagens trocadas com seus contatos.</p>
            <p style={{ marginTop: 10 }}><strong>Dados de contatos:</strong> números de telefone e metadados de contatos sincronizados pelas suas sessões conectadas.</p>
          </Section>

          <Section title="3. Como Usamos seus Dados">
            <ul>
              <li>Prestação e manutenção do Serviço;</li>
              <li>Autenticação e segurança da conta;</li>
              <li>Envio de notificações transacionais e alertas operacionais;</li>
              <li>Análise de uso para melhoria contínua da plataforma;</li>
              <li>Cumprimento de obrigações legais e regulatórias;</li>
              <li>Cobrança e gestão de assinaturas.</li>
            </ul>
          </Section>

          <Section title="4. Base Legal para Tratamento (LGPD)">
            <p>O tratamento dos seus dados é fundamentado nas seguintes bases legais previstas na LGPD:</p>
            <ul>
              <li><strong>Execução de contrato</strong> — para fornecer o Serviço contratado;</li>
              <li><strong>Legítimo interesse</strong> — para segurança, prevenção a fraudes e melhoria do produto;</li>
              <li><strong>Cumprimento de obrigação legal</strong> — quando exigido por lei ou autoridade competente;</li>
              <li><strong>Consentimento</strong> — para comunicações de marketing, quando aplicável.</li>
            </ul>
          </Section>

          <Section title="5. Compartilhamento de Dados">
            <p>Não vendemos seus dados. Podemos compartilhá-los com:</p>
            <ul>
              <li><strong>Provedores de infraestrutura</strong> (ex.: AWS, Google Cloud) para hospedagem segura;</li>
              <li><strong>Processadores de pagamento</strong> para gestão de cobranças;</li>
              <li><strong>Ferramentas de análise</strong> anônimas para métricas de produto;</li>
              <li><strong>Autoridades competentes</strong> quando exigido por lei ou ordem judicial.</li>
            </ul>
            <p style={{ marginTop: 12 }}>Todos os terceiros são contratualmente obrigados a tratar seus dados com o mesmo nível de proteção que adotamos.</p>
          </Section>

          <Section title="6. Retenção de Dados">
            <p>Mantemos seus dados pelo período necessário para a prestação do Serviço e cumprimento de obrigações legais. Após o cancelamento da conta, dados são anonimizados ou excluídos em até 90 dias, exceto quando a retenção for exigida por lei.</p>
          </Section>

          <Section title="7. Segurança">
            <p>Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:</p>
            <ul>
              <li>Criptografia em trânsito (TLS 1.3) e em repouso (AES-256);</li>
              <li>Controle de acesso baseado em função (RBAC);</li>
              <li>Monitoramento contínuo de vulnerabilidades;</li>
              <li>Autenticação de dois fatores disponível para todas as contas.</li>
            </ul>
          </Section>

          <Section title="8. Seus Direitos (LGPD — Art. 18)">
            <p>Como titular dos dados, você tem direito a:</p>
            <ul>
              <li>Confirmar a existência de tratamento e acessar seus dados;</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
              <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>Portabilidade dos seus dados para outro fornecedor;</li>
              <li>Revogar o consentimento a qualquer momento;</li>
              <li>Solicitar informações sobre o compartilhamento de dados.</li>
            </ul>
            <p style={{ marginTop: 12 }}>Para exercer seus direitos, envie solicitação para <a href="mailto:privacidade@wppconnect.io" style={{ color: 'var(--accent-ink)' }}>privacidade@wppconnect.io</a>. Responderemos em até 15 dias úteis.</p>
          </Section>

          <Section title="9. Cookies">
            <p>Utilizamos cookies essenciais para funcionamento da plataforma (autenticação, preferências de tema). Não utilizamos cookies de rastreamento de terceiros para fins publicitários.</p>
          </Section>

          <Section title="10. Alterações desta Política">
            <p>Podemos atualizar esta Política periodicamente. Notificaremos por e-mail e banner no painel com antecedência mínima de 15 dias para alterações relevantes. A data de "última atualização" no topo indica a versão vigente.</p>
          </Section>

          <Section title="11. Encarregado de Dados (DPO)">
            <p>Nosso Encarregado de Proteção de Dados pode ser contatado em <a href="mailto:dpo@wppconnect.io" style={{ color: 'var(--accent-ink)' }}>dpo@wppconnect.io</a> para questões relacionadas ao tratamento de dados pessoais.</p>
          </Section>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', color: 'var(--ink-3)', fontSize: 12.5 }}>
            Dúvidas sobre privacidade? <a href="mailto:privacidade@wppconnect.io" style={{ color: 'var(--accent-ink)' }}>privacidade@wppconnect.io</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--ink-1)' }}>{title}</h2>
      <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
