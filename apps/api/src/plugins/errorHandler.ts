import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyError } from 'fastify';
import { AppError } from '../errors/index.js';

export default fp(
    async (fastify: FastifyInstance) => {
        fastify.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
            if (error instanceof AppError) {
                fastify.log.warn(
                    { code: error.code, path: request.url, requestId: request.id },
                    error.message,
                );
                return reply.status(error.statusCode).send({
                    error: error.code,
                    message: error.message,
                    ...(error.details && { details: error.details }),
                    requestId: request.id,
                });
            }

            const fastifyError = error as FastifyError;

            if (fastifyError.validation) {
                fastify.log.warn(
                    { path: request.url, requestId: request.id },
                    'Request validation failed',
                );
                return reply.status(400).send({
                    error: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: fastifyError.validation,
                    requestId: request.id,
                });
            }

            if (fastifyError.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
                fastify.log.warn({ path: request.url, requestId: request.id }, 'Token expired');
                return reply.status(401).send({
                    error: 'TOKEN_EXPIRED',
                    message: 'Token expired',
                    requestId: request.id,
                });
            }

            if (
                fastifyError.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' ||
                fastifyError.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER'
            ) {
                fastify.log.warn({ path: request.url, requestId: request.id }, 'Invalid token');
                return reply.status(401).send({
                    error: 'TOKEN_INVALID',
                    message: 'Invalid token',
                    requestId: request.id,
                });
            }

            fastify.log.error(
                { err: error, path: request.url, requestId: request.id },
                'Unhandled error',
            );
            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message:
                    process.env.NODE_ENV === 'production'
                        ? 'An unexpected error occurred'
                        : error.message,
                requestId: request.id,
            });
        });
    },
    { name: 'errorHandler' },
);
