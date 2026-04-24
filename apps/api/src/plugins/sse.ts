import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

export interface SseEvent {
    type: string;
    payload: unknown;
    timestamp?: string;
}

export type SseEventFilter = (event: SseEvent) => boolean;

export interface SseManager {
    addClient(reply: FastifyReply, filter?: SseEventFilter): string;
    removeClient(id: string): void;
    broadcast(event: SseEvent): void;
    clientCount(): number;
}

interface SseClient {
    reply: FastifyReply;
    filter?: SseEventFilter;
}

declare module 'fastify' {
    interface FastifyInstance {
        sse: SseManager;
    }
}

export default fp(
    async (fastify: FastifyInstance) => {
        const clients = new Map<string, SseClient>();

        const heartbeatInterval = setInterval(() => {
            for (const [id, client] of clients) {
                try {
                    client.reply.raw.write(': ping\n\n');
                } catch {
                    clients.delete(id);
                }
            }
        }, 30_000);

        const manager: SseManager = {
            addClient(reply: FastifyReply, filter?: SseEventFilter): string {
                const id = randomUUID();
                clients.set(id, { reply, filter });
                return id;
            },

            removeClient(id: string): void {
                clients.delete(id);
            },

            broadcast(event: SseEvent): void {
                const enriched: SseEvent = {
                    type: event.type,
                    payload: event.payload,
                    timestamp: event.timestamp ?? new Date().toISOString(),
                };
                const message = `data: ${JSON.stringify(enriched)}\n\n`;

                for (const [id, client] of clients) {
                    if (client.filter && !client.filter(enriched)) continue;
                    try {
                        client.reply.raw.write(message);
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
            for (const [, client] of clients) {
                try {
                    client.reply.raw.end();
                } catch {
                    // client already disconnected
                }
            }
            clients.clear();
        });
    },
    { name: 'sse' },
);
