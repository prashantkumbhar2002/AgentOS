import type { PrismaClient } from '@prisma/client';
import type { IUserRepository, UserDTO, CreateUserInput } from '../interfaces/IUserRepository.js';

export class PrismaUserRepository implements IUserRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findByEmail(email: string): Promise<UserDTO | null> {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async findById(id: string): Promise<UserDTO | null> {
        return this.prisma.user.findUnique({ where: { id } });
    }

    async findByRole(role: string): Promise<UserDTO | null> {
        return this.prisma.user.findFirst({ where: { role } });
    }

    async findByNameContains(name: string): Promise<UserDTO | null> {
        return this.prisma.user.findFirst({
            where: { name: { contains: name } },
        });
    }

    async create(data: CreateUserInput): Promise<UserDTO> {
        return this.prisma.user.create({ data });
    }
}
