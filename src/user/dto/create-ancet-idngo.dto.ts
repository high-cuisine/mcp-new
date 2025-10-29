export class CreateAncetIdngoRto {
    id: string; // applicantId
    createdAt: string;
    clientId: string;
    inspectionId: string;
    externalUserId: string;
    fixedInfo?: {
        placeOfBirth?: string;
        country?: string;
    };
    email: string;
    phone?: string;
    requiredIdDocs: {
        excludedCountries?: string[];
        docSets: {
            idDocSetType: string;
            types: string[];
            subTypes?: string[];
            videoRequired?: string;
        }[];
    };
    review: {
        reprocessing?: boolean;
        reviewId?: string;
        attemptId?: string;
        attemptCnt?: number;
        levelName?: string;
        levelAutoCheckMode?: string | null;
        createDate: string;
        reviewStatus: string;
        priority?: number;
    };
    type: string;
}