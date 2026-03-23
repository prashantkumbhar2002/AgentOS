import type { PrismaClient } from "@prisma/client";
import { PrismaAgentRepository } from "./repositories/prisma/PrismaAgentRepository.js";
import { PrismaAuditRepository } from "./repositories/prisma/PrismaAuditRepository.js";
import { PrismaApprovalRepository } from "./repositories/prisma/PrismaApprovalRepository.js";
import { PrismaPolicyRepository } from "./repositories/prisma/PrismaPolicyRepository.js";
import { PrismaAnalyticsRepository } from "./repositories/prisma/PrismaAnalyticsRepository.js";
import { AgentService } from "./modules/agents/agents.service.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { ApprovalService } from "./modules/approvals/approvals.service.js";
import { PolicyService } from "./modules/policies/policies.service.js";
import { PolicyEvaluator } from "./modules/policies/policies.evaluator.js";
import { AnalyticsService } from "./modules/analytics/analytics.service.js";

export interface ServiceContainer {
    agentService: AgentService;
    auditService: AuditService;
    approvalService: ApprovalService;
    policyService: PolicyService;
    policyEvaluator: PolicyEvaluator;
    analyticsService: AnalyticsService;
}

export function createContainer(prisma: PrismaClient): ServiceContainer {
    const agentRepo = new PrismaAgentRepository(prisma);
    const auditRepo = new PrismaAuditRepository(prisma);
    const approvalRepo = new PrismaApprovalRepository(prisma);
    const policyRepo = new PrismaPolicyRepository(prisma);
    const analyticsRepo = new PrismaAnalyticsRepository(prisma);

    const agentService = new AgentService(
        agentRepo,
        auditRepo,
        approvalRepo,
        policyRepo,
    );
    const auditService = new AuditService(auditRepo, agentRepo);
    const approvalService = new ApprovalService(approvalRepo);
    const policyService = new PolicyService(policyRepo, agentRepo);
    const policyEvaluator = new PolicyEvaluator(policyRepo, agentRepo);
    const analyticsService = new AnalyticsService(analyticsRepo);

    return {
        agentService,
        auditService,
        approvalService,
        policyService,
        policyEvaluator,
        analyticsService,
    };
}
