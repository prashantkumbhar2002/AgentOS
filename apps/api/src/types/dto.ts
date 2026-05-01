// PaginatedResult generic
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

// Agent DTOs
export interface AgentToolDTO {
    id: string;
    name: string;
    description: string;
}

export interface AgentSummary {
    id: string;
    name: string;
    status: string;
    riskTier: string;
    ownerTeam: string;
    environment: string;
    lastActiveAt: Date | null;
    toolCount: number;
    cost7dUsd: number;
}

export interface AgentDetail {
    id: string;
    name: string;
    description: string;
    ownerTeam: string;
    llmModel: string;
    riskTier: string;
    environment: string;
    status: string;
    approvedBy: string | null;
    tags: string[];
    /** Rolling 30-day spend cap in USD. `null` means unlimited. */
    budgetUsd: number | null;
    createdAt: Date;
    updatedAt: Date;
    lastActiveAt: Date | null;
    tools: AgentToolDTO[];
    apiKeyHint: string | null;
    hasApiKey: boolean;
}

export interface AgentDetailView extends AgentDetail {
    stats: AgentStats;
    recentLogs: AuditLogEntry[];
    pendingApprovals: ApprovalTicketSummary[];
    policies: PolicyDetail[];
}

export interface AgentStats {
    totalRuns: number;
    totalCost7dUsd: number;
    avgLatencyMs: number;
    errorRate: number;
    healthScore: number;
}

// Audit DTOs
export interface AuditLogEntry {
    id: string;
    agentId: string;
    traceId: string;
    spanId: string | null;
    parentSpanId: string | null;
    event: string;
    model: string | null;
    toolName: string | null;
    inputs: unknown;
    outputs: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    latencyMs: number | null;
    success: boolean;
    errorMsg: string | null;
    metadata: unknown;
    langsmithRunId: string | null;
    langsmithProject: string | null;
    createdAt: Date;
}

export interface AuditLogWithAgent extends AuditLogEntry {
    agentName: string;
}

export interface TraceDetail {
    traceId: string;
    agentId: string;
    agentName: string;
    events: AuditLogEntry[];
    totalCost: number;
    totalLatencyMs: number;
    startedAt: Date;
    completedAt: Date;
    success: boolean;
}

export interface AuditAgentStats {
    totalRuns: number;
    totalCalls: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    errorRate: number;
    successRate: number;
    topTools: { name: string; count: number }[];
}

export interface AuditQueryResult extends PaginatedResult<AuditLogEntry> {
    totalCostUsd: number;
}

// Approval DTOs
export interface ApprovalTicketSummary {
    id: string;
    agentId: string;
    agentName: string;
    actionType: string;
    payload: unknown;
    riskScore: number;
    reasoning: string;
    status: string;
    resolvedById: string | null;
    resolvedByName: string | null;
    resolvedAt: Date | null;
    expiresAt: Date;
    slackMsgTs: string | null;
    createdAt: Date;
}

export interface ApprovalTicketDetail extends ApprovalTicketSummary {
    resolverEmail?: string;
}

export interface ApprovalListResult extends PaginatedResult<ApprovalTicketSummary> {
    pendingCount: number;
}

// Policy DTOs
export interface PolicyRuleDTO {
    id: string;
    actionType: string;
    riskTiers: string[];
    effect: string;
    conditions: unknown;
}

export interface PolicyAgentDTO {
    agentId: string;
    agentName: string;
}

export interface PolicyDetail {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
    createdAt: Date;
    rules: PolicyRuleDTO[];
    agents?: PolicyAgentDTO[];
}

export interface PolicyWithRules {
    id: string;
    name: string;
    isActive: boolean;
    rules: PolicyRuleDTO[];
}

// Analytics raw DTOs (returned by repository, consumed by service)
export interface CostAggregate {
    rangeKey: string;
    totalUsd: number;
}

export interface DailyCostEntry {
    date: string;
    agentId: string;
    agentName: string;
    costUsd: number;
}

export interface UsageCounts {
    totalRuns: number;
    totalLlmCalls: number;
    totalToolCalls: number;
    totalCostUsd: number;
}

export interface ApprovalStatusCounts {
    approved: number;
    denied: number;
    expired: number;
    autoApproved: number;
    pending: number;
}

export interface AgentMetricRow {
    agentId: string;
    agentName: string;
    ownerTeam: string;
    totalCostUsd: number;
    totalEvents: number;
    errorCount: number;
    avgLatencyMs: number;
    totalRuns: number;
    totalApprovals: number;
    deniedCount: number;
}

export interface ModelMetricRow {
    model: string;
    callCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
}

// Input types for repositories
export interface CreateAuditLogInput {
    agentId: string;
    traceId: string;
    spanId?: string | null;
    parentSpanId?: string | null;
    event: string;
    model?: string | null;
    toolName?: string | null;
    inputs?: unknown;
    outputs?: unknown;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costUsd: number;
    latencyMs?: number | null;
    success?: boolean;
    errorMsg?: string | null;
    metadata?: unknown;
    langsmithRunId?: string | null;
    langsmithProject?: string | null;
}

export interface ResolveTicketInput {
    status: 'APPROVED' | 'DENIED';
    resolvedById: string;
    resolvedAt: Date;
    reasoning?: string;
}

export interface DateFilter {
    gte?: Date;
    lte?: Date;
}

export interface DateRange {
    key: string;
    gte?: Date;
    lt?: Date;
}
