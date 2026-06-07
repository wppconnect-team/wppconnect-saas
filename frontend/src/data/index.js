export const INITIAL_SESSIONS = [
  {
    id: 'wa_01',
    name: 'Suporte Brasil',
    phone: '+55 11 94821-3307',
    status: 'connected',
    created: '18/04/2026',
    lastActivity: 'há 2 min',
    messagesToday: 1243,
    tag: 'atendimento',
  },
  {
    id: 'wa_02',
    name: 'Vendas Outbound',
    phone: '+55 21 98712-6540',
    status: 'qr',
    created: '24/04/2026',
    lastActivity: '—',
    messagesToday: 0,
    tag: 'marketing',
  },
  {
    id: 'wa_03',
    name: 'Notificações CRM',
    phone: '+55 31 99120-7788',
    status: 'pending',
    created: '21/04/2026',
    lastActivity: 'há 1 h',
    messagesToday: 87,
    tag: 'sistema',
  },
  {
    id: 'wa_04',
    name: 'Recuperação Checkout',
    phone: '+55 11 95432-1100',
    status: 'offline',
    created: '02/04/2026',
    lastActivity: 'há 3 d',
    messagesToday: 0,
    tag: 'recuperacao',
  },
  {
    id: 'wa_05',
    name: 'Onboarding Clientes',
    phone: '+55 41 99633-4822',
    status: 'connected',
    created: '11/04/2026',
    lastActivity: 'há 12 min',
    messagesToday: 318,
    tag: 'onboarding',
  },
];

export const NAV_MAIN = [
  { id: 'dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { id: 'conexoes',  label: 'Conexões',  icon: 'Link', active: true },
  { id: 'contatos',  label: 'Contatos',  icon: 'Users' },
  { id: 'grupos',    label: 'Grupos',    icon: 'Group' },
];

export const NAV_DEV = [
  { id: 'webhooks', label: 'Webhooks', icon: 'Webhook' },
  { id: 'api', label: 'API & Tokens', icon: 'Code' },
  { id: 'logs', label: 'Logs', icon: 'List' },
];

export const NAV_ACCT = [
  { id: 'config', label: 'Configurações', icon: 'Settings' },
];
