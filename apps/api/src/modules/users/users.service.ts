import bcrypt from 'bcrypt';
import type { IUserRepository, UserDTO } from '../../repositories/interfaces/IUserRepository.js';

const BCRYPT_ROUNDS = 10;

export class UserService {
    constructor(private readonly userRepo: IUserRepository) { }

    async findByEmail(email: string): Promise<UserDTO | null> {
        return this.userRepo.findByEmail(email);
    }

    async findByNameContains(name: string): Promise<UserDTO | null> {
        return this.userRepo.findByNameContains(name);
    }

    async findByRole(role: string): Promise<UserDTO | null> {
        return this.userRepo.findByRole(role);
    }

    async createUser(data: {
        email: string;
        password: string;
        name: string;
        role: string;
    }): Promise<UserDTO> {
        const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        return this.userRepo.create({
            email: data.email,
            passwordHash,
            name: data.name,
            role: data.role,
        });
    }

    async comparePassword(plain: string, hash: string): Promise<boolean> {
        return bcrypt.compare(plain, hash);
    }
}

export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
