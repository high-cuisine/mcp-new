export class ImexResultsRequestDto {
    reviewStatus: string;
    createdAtMs: string;
    reviewResult: {
        reviewAnswer: 'GREEN' | 'YELLOW' | 'RED' | 'ERROR';
        moderationComment?: string;
        clientComment?: string;
        reviewRejectType?: 'RETRY' | 'FINAL';
        rejectLabels?: string[];
        errorMessage?: string;
    };
    applicantId: string;
    verificationType: 'LIVENESS' | 'FULL';
}