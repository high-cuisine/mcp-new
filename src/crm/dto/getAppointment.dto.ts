import { Admission } from '@common/entities/admission.entity';

export class GetAppointmentDto {
    success: boolean;
    message: string;
    data: {
        totalCount: string;
        admission: Admission[];
    };
}