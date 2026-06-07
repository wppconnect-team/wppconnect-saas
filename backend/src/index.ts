import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';

import { securityPlugin }  from './plugins/security';
import { authRoutes }      from './routes/auth';
import { sessionRoutes }   from './routes/sessions';
import { contactRoutes }   from './routes/contacts';
import { webhookRoutes }   from './routes/webhooks';
import { tokenRoutes }     from './routes/tokens';
import { logRoutes }       from './routes/logs';
import { dashboardRoutes } from './routes/dashboard';
import { groupRoutes }     from './routes/groups';

const PORT = Number(process.env.PORT ?? 3000);

const origins = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',');

const app = new Elysia()
  .use(securityPlugin)
  .use(swagger({
    path: '/docs',
    documentation: {
      info: {
        title: 'Wppconnect API',
        version: '1.0.0',
        description: 'API de gerenciamento de sessões WhatsApp',
      },
      tags: [
        { name: 'Auth',      description: 'Autenticação e usuário'     },
        { name: 'Sessions',  description: 'Sessões WhatsApp'           },
        { name: 'Contacts',  description: 'Contatos'                   },
        { name: 'Webhooks',  description: 'Endpoints de webhook'       },
        { name: 'Tokens',    description: 'Tokens de API'              },
        { name: 'Logs',      description: 'Logs do sistema'            },
        { name: 'Dashboard', description: 'Métricas e visão geral'     },
        { name: 'Groups',    description: 'Grupos WhatsApp'            },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  }))
  .use(cors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))

  // Health check público
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))

  // Todas as rotas sob /api
  .use(authRoutes)
  .use(dashboardRoutes)
  .use(sessionRoutes)
  .use(contactRoutes)
  .use(groupRoutes)
  .use(webhookRoutes)
  .use(tokenRoutes)
  .use(logRoutes)

  // Erro global
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 400;
      return { error: 'Dados inválidos', details: error.message };
    }
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Recurso não encontrado' };
    }
    console.error(`[${code}]`, error);
    set.status = 500;
    return { error: 'Erro interno do servidor' };
  })

  .listen(PORT);

console.log(`🦊  Wppconnect API → http://localhost:${PORT}`);
