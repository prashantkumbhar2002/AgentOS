import type { FastifyInstance } from 'fastify';
import { LoginSchema, RoleEnum } from '@agentos/types';
import type { Role } from '@agentos/types';
import { authenticate } from '../../plugins/auth.js';
import { InvalidCredentialsError, ValidationError } from '../../errors/index.js';

export default async function usersRoutes(
    fastify: FastifyInstance,
): Promise<void> {
    const { userService } = fastify.services;

    fastify.post(
        '/login',
        {
            config: {
                rateLimit: { max: 10, timeWindow: '15 minutes' },
            },
        },
        async (request, reply) => {
            const parsed = LoginSchema.safeParse(request.body);
            if (!parsed.success) {
                throw new ValidationError('Validation failed', { issues: parsed.error.issues });
            }

            const { email, password } = parsed.data;
            const user = await userService.findByEmail(email);

            // SECURITY: same response for "user not found" and "wrong password" so callers
            // cannot enumerate accounts. Do NOT branch on which condition failed.
            if (!user) {
                throw new InvalidCredentialsError();
            }

            const valid = await userService.comparePassword(password, user.passwordHash);
            if (!valid) {
                throw new InvalidCredentialsError();
            }

            const role = RoleEnum.parse(user.role);
            const payload: { id: string; email: string; name: string; role: Role } = {
                id: user.id,
                email: user.email,
                name: user.name,
                role,
            };
            const accessToken = fastify.jwt.sign(payload);

            return reply.status(200).send({ accessToken, user: payload });
        },
    );

    fastify.post(
        '/refresh',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const { id, email, name, role } = request.user;
            const payload = { id, email, name, role };
            const accessToken = fastify.jwt.sign(payload);

            return reply.status(200).send({ accessToken, user: payload });
        },
    );

    fastify.get(
        '/me',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const { id, email, name, role } = request.user;
            return reply.status(200).send({ id, email, name, role });
        },
    );
}
