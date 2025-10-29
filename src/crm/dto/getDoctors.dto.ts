export interface GetDoctorsDto {

    success: boolean;
    message: string;
    data: {
        totalCount: number;
        userPosition: {
            id: number;
            title: string;
            admission_length: string;
        }[];
    };
}