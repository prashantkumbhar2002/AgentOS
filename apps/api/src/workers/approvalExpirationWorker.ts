import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PrismaApprovalRepository } from '../repositories/prisma/PrismaApprovalRepository.js';
import { ApprovalService } from '../modules/approvals/approvals.service.js';
import { getRedisConnection } from '../plugins/bullmq.js';

const prisma = new PrismaClient();
const approvalRepo = new PrismaApprovalRepository(prisma);
const approvalService = new ApprovalService(approvalRepo);

export function startExpirationWorker() {
    const connection = getRedisConnection();

    const worker = new Worker(
        'notifications',
        async (job: Job) => {
            if (job.name !== 'expire-pending-approvals') return;

            const count = await approvalService.expirePendingTickets();
            if (count > 0) {
                console.log(`[expirationWorker] Expired ${count} pending ticket(s)`);
            }
        },
        { connection },
    );

    worker.on('failed', (job, err) => {
        console.error(`[expirationWorker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
}
