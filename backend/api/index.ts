import { Elysia } from 'elysia';
import app from '../src/index';

if (!(app instanceof Elysia)) {
  throw new Error('Control-plane entrypoint did not export an Elysia app');
}

export default app;
