import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

export interface SseEvent {
  type: string;
  payload: unknown;
  timestamp?: string;
}

export interface SseManager {
  addClient(reply: FastifyReply): string;
  removeClient(id: string): void;
  broadcast(event: SseEvent): void;
  clientCount(): number;
}

declare module 'fastify' {
  interface FastifyInstance {
    sse: SseManager;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const clients = new Map<string, FastifyReply>();

    const heartbeatInterval = setInterval(() => {
      for (const [id, reply] of clients) {
        try {
          reply.raw.write(': ping\n\n');
        } catch {
          clients.delete(id);
        }
      }
    }, 30_000);

    const manager: SseManager = {
      addClient(reply: FastifyReply): string {
        const id = randomUUID();
        clients.set(id, reply);
        return id;
      },

      removeClient(id: string): void {
        clients.delete(id);
      },

      broadcast(event: SseEvent): void {
        const data = JSON.stringify({
          type: event.type,
          payload: event.payload,
          timestamp: event.timestamp ?? new Date().toISOString(),
        });
        const message = `data: ${data}\n\n`;

        for (const [id, reply] of clients) {
          try {
            reply.raw.write(message);
          } catch {
            clients.delete(id);
          }
        }
      },

      clientCount(): number {
        return clients.size;
      },
    };

    fastify.decorate('sse', manager);

    fastify.addHook('onClose', async () => {
      clearInterval(heartbeatInterval);
      for (const [, reply] of clients) {
        try {
          reply.raw.end();
        } catch {
          // client already disconnected
        }
      }
      clients.clear();
    });
  },
  { name: 'sse' },
);
