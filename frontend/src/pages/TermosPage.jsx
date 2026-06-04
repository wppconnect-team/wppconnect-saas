import React from 'react';
import Ic from '../components/icons';

export default function TermosPage({ onClose }) {
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
          Termos de Uso
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 40 }}>
          Última atualização: 01 de maio de 2026
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          <Section title="1. Aceitação dos Termos">
            <p>Ao acessar ou utilizar a plataforma Wppconnect ("Serviço"), você concorda em ficar vinculado a estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não poderá acessar o Serviço.</p>
          </Section>

          <Section title="2. Descrição do Serviço">
            <p>O Wppconnect é uma plataforma de gerenciamento de conexões WhatsApp que permite a criação, monitoramento e automação de sessões de mensagens. O Serviço é disponibilizado mediante assinatura, nas modalidades descritas em nossa página de planos.</p>
          </Section>

          <Section title="3. Uso Permitido">
            <p>Você concorda em utilizar o Serviço exclusivamente para fins legítimos e em conformidade com:</p>
            <ul>
              <li>Os Termos de Serviço do WhatsApp e Meta Platforms;</li>
              <li>A legislação brasileira aplicável, incluindo a Lei Geral de Proteção de Dados (LGPD);</li>
              <li>Regulamentações setoriais aplicáveis ao seu negócio.</li>
            </ul>
            <p style={{ marginTop: 12 }}>É expressamente vedado o uso do Serviço para envio de spam, conteúdo ilegal, mensagens não solicitadas em massa ou qualquer atividade que viole os termos do WhatsApp.</p>
          </Section>

          <Section title="4. Conta e Responsabilidades">
            <p>Você é responsável por manter a confidencialidade das credenciais de acesso à sua conta. Qualquer atividade realizada com sua conta é de sua inteira responsabilidade. Notifique-nos imediatamente em caso de uso não autorizado.</p>
          </Section>

          <Section title="5. Disponibilidade e SLA">
            <p>Comprometemo-nos a manter disponibilidade de 99,9% ao mês, exceto em janelas de manutenção programada informadas com antecedência mínima de 24 horas. Situações de força maior, falhas de infraestrutura de terceiros (incluindo WhatsApp/Meta) e incidentes de segurança podem impactar a disponibilidade sem gerar obrigação de ressarcimento.</p>
          </Section>

          <Section title="6. Limitação de Responsabilidade">
            <p>O Wppconnect não se responsabiliza por:</p>
            <ul>
              <li>Banimentos ou restrições impostos pelo WhatsApp às suas contas;</li>
              <li>Perda de dados decorrente de uso inadequado da plataforma;</li>
              <li>Danos indiretos, lucros cessantes ou danos consequenciais;</li>
              <li>Interrupções causadas por terceiros (provedores de nuvem, Meta, etc.).</li>
            </ul>
          </Section>

          <Section title="7. Propriedade Intelectual">
            <p>Todo o conteúdo, marca, código e interfaces do Wppconnect são propriedade exclusiva da empresa e protegidos por leis de propriedade intelectual. É vedada a reprodução, cópia ou engenharia reversa sem autorização expressa.</p>
          </Section>

          <Section title="8. Cancelamento e Rescisão">
            <p>Você pode cancelar sua assinatura a qualquer momento pelo painel de Configurações. O cancelamento tem efeito no final do período de faturamento vigente. Reservamo-nos o direito de encerrar contas que violem estes Termos, sem reembolso.</p>
          </Section>

          <Section title="9. Modificações dos Termos">
            <p>Podemos atualizar estes Termos periodicamente. Notificaremos por e-mail e banner no painel com antecedência mínima de 15 dias. O uso continuado do Serviço após as alterações constitui aceitação dos novos termos.</p>
          </Section>

          <Section title="10. Legislação Aplicável">
            <p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o Foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.</p>
          </Section>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', color: 'var(--ink-3)', fontSize: 12.5 }}>
            Dúvidas? Entre em contato: <a href="mailto:legal@wppconnect.io" style={{ color: 'var(--accent-ink)' }}>legal@wppconnect.io</a>
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
