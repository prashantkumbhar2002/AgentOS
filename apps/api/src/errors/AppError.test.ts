import { describe, it, expect } from 'vitest';
import {
    AppError,
    NotFoundError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    InvalidTransitionError,
    PolicyBlockedError,
    ExternalServiceError,
} from './AppError.js';

describe('AppError', () => {
    it('sets code, message, statusCode, and name', () => {
        const err = new AppError('TEST', 'test msg', 418);
        expect(err.code).toBe('TEST');
        expect(err.message).toBe('test msg');
        expect(err.statusCode).toBe(418);
        expect(err.name).toBe('AppError');
        expect(err).toBeInstanceOf(Error);
    });

    it('includes optional details', () => {
        const err = new AppError('TEST', 'msg', 400, { key: 'val' });
        expect(err.details).toEqual({ key: 'val' });
    });

    it('details are undefined when not provided', () => {
        const err = new AppError('TEST', 'msg', 400);
        expect(err.details).toBeUndefined();
    });
});

describe('NotFoundError', () => {
    it('returns 404 with resource info', () => {
        const err = new NotFoundError('Agent', 'abc-123');
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('NOT_FOUND');
        expect(err.message).toBe("Agent with id 'abc-123' not found");
        expect(err.name).toBe('NotFoundError');
        expect(err.details).toEqual({ resource: 'Agent', id: 'abc-123' });
    });

    it('is an instance of AppError', () => {
        const err = new NotFoundError('Policy', 'xyz');
        expect(err).toBeInstanceOf(AppError);
        expect(err).toBeInstanceOf(Error);
    });
});

describe('ValidationError', () => {
    it('returns 400 with message', () => {
        const err = new ValidationError('Invalid input');
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.message).toBe('Invalid input');
        expect(err.name).toBe('ValidationError');
    });

    it('includes details when provided', () => {
        const err = new ValidationError('Bad field', { field: 'email' });
        expect(err.details).toEqual({ field: 'email' });
    });
});

describe('AuthenticationError', () => {
    it('returns 401 for TOKEN_EXPIRED', () => {
        const err = new AuthenticationError('TOKEN_EXPIRED');
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe('TOKEN_EXPIRED');
        expect(err.message).toBe('Token expired');
        expect(err.name).toBe('AuthenticationError');
    });

    it('returns 401 for TOKEN_INVALID', () => {
        const err = new AuthenticationError('TOKEN_INVALID');
        expect(err.code).toBe('TOKEN_INVALID');
        expect(err.message).toBe('Invalid token');
    });

    it('returns 401 for TOKEN_MISSING', () => {
        const err = new AuthenticationError('TOKEN_MISSING');
        expect(err.code).toBe('TOKEN_MISSING');
        expect(err.message).toBe('Authentication required');
    });
});

describe('AuthorizationError', () => {
    it('returns 403 without required role', () => {
        const err = new AuthorizationError();
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('FORBIDDEN');
        expect(err.message).toBe('Insufficient permissions');
        expect(err.name).toBe('AuthorizationError');
    });

    it('returns 403 with required role', () => {
        const err = new AuthorizationError('admin');
        expect(err.message).toBe('Insufficient permissions. Requires: admin');
    });
});

describe('ConflictError', () => {
    it('returns 409 with message', () => {
        const err = new ConflictError('Already exists');
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('CONFLICT');
        expect(err.message).toBe('Already exists');
        expect(err.name).toBe('ConflictError');
    });

    it('is an instance of AppError', () => {
        expect(new ConflictError('dup')).toBeInstanceOf(AppError);
    });
});

describe('InvalidTransitionError', () => {
    it('returns 400 with from/to states', () => {
        const err = new InvalidTransitionError('DRAFT', 'SUSPENDED');
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_TRANSITION');
        expect(err.message).toBe('Cannot transition from DRAFT to SUSPENDED');
        expect(err.details).toEqual({ from: 'DRAFT', to: 'SUSPENDED' });
        expect(err.name).toBe('InvalidTransitionError');
    });

    it('includes reason when provided', () => {
        const err = new InvalidTransitionError('ACTIVE', 'DRAFT', 'not allowed');
        expect(err.message).toBe('Cannot transition from ACTIVE to DRAFT: not allowed');
    });
});

describe('PolicyBlockedError', () => {
    it('returns 403 with action and policy info', () => {
        const err = new PolicyBlockedError('send_email', 'No External Email');
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('POLICY_BLOCKED');
        expect(err.message).toBe("Action 'send_email' blocked by policy: No External Email");
        expect(err.details).toEqual({ actionType: 'send_email', policyName: 'No External Email' });
        expect(err.name).toBe('PolicyBlockedError');
    });

    it('is an instance of AppError', () => {
        expect(new PolicyBlockedError('x', 'y')).toBeInstanceOf(AppError);
    });
});

describe('ExternalServiceError', () => {
    it('returns 503 with service name', () => {
        const err = new ExternalServiceError('Anthropic');
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
        expect(err.message).toBe('Anthropic is unavailable');
        expect(err.details).toEqual({ service: 'Anthropic' });
        expect(err.name).toBe('ExternalServiceError');
    });

    it('includes original error when provided', () => {
        const err = new ExternalServiceError('Slack', 'ECONNREFUSED');
        expect(err.details).toEqual({ service: 'Slack', originalError: 'ECONNREFUSED' });
    });
});
