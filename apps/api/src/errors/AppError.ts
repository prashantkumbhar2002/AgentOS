const authMessages: Record<string, string> = {
    TOKEN_EXPIRED: 'Token expired',
    TOKEN_INVALID: 'Invalid token',
    TOKEN_MISSING: 'Authentication required',
};

export class AppError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode: number,
        public readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id: string) {
        super('NOT_FOUND', `${resource} with id '${id}' not found`, 404, { resource, id });
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('VALIDATION_ERROR', message, 400, details);
    }
}

export class AuthenticationError extends AppError {
  constructor(reason: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'TOKEN_MISSING') {
    super(reason, authMessages[reason] ?? 'Authentication failed', 401);
  }
}

/**
 * Login credential failure. We deliberately use the same response for "user not
 * found" and "wrong password" to prevent user enumeration. NEVER reuse
 * AuthenticationError('TOKEN_INVALID') for credential exchange — no token is
 * involved in /login, and "TOKEN_INVALID" misleads operators reading audit logs.
 */
export class InvalidCredentialsError extends AppError {
    constructor() {
        super('INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }
}

export class AuthorizationError extends AppError {
    constructor(requiredRole?: string) {
        super(
            'FORBIDDEN',
            `Insufficient permissions${requiredRole ? `. Requires: ${requiredRole}` : ''}`,
            403,
        );
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super('CONFLICT', message, 409);
    }
}

export class InvalidTransitionError extends AppError {
    constructor(from: string, to: string, reason?: string) {
        super(
            'INVALID_TRANSITION',
            `Cannot transition from ${from} to ${to}${reason ? `: ${reason}` : ''}`,
            400,
            { from, to },
        );
    }
}

export class PolicyBlockedError extends AppError {
    constructor(actionType: string, policyName: string) {
        super(
            'POLICY_BLOCKED',
            `Action '${actionType}' blocked by policy: ${policyName}`,
            403,
            { actionType, policyName },
        );
    }
}

export class ExternalServiceError extends AppError {
    constructor(service: string, originalError?: string) {
        super(
            'EXTERNAL_SERVICE_ERROR',
            `${service} is unavailable`,
            503,
            { service, ...(originalError && { originalError }) },
        );
    }
}

/**
 * Returned by the audit ingest path when an agent's rolling spend exceeds
 * its configured `budgetUsd`. HTTP 402 (Payment Required) tells the SDK
 * this is a hard cap, not a transient error — retrying will not help.
 */
export class BudgetExceededError extends AppError {
    constructor(agentId: string, currentUsd: number, budgetUsd: number, windowDays: number) {
        super(
            'BUDGET_EXCEEDED',
            `Agent ${agentId} budget exceeded: $${currentUsd.toFixed(4)} / $${budgetUsd.toFixed(4)} (last ${windowDays}d)`,
            402,
            { agentId, currentUsd, budgetUsd, windowDays },
        );
    }
}
