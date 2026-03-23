export interface UserDTO {
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    role: string;
    createdAt: Date;
}

export interface CreateUserInput {
    email: string;
    passwordHash: string;
    name: string;
    role: string;
}

export interface IUserRepository {
    findByEmail(email: string): Promise<UserDTO | null>;
    findById(id: string): Promise<UserDTO | null>;
    findByRole(role: string): Promise<UserDTO | null>;
    findByNameContains(name: string): Promise<UserDTO | null>;
    create(data: CreateUserInput): Promise<UserDTO>;
}
