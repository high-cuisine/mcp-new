export class GetClinicsDto {
    success: boolean;
    message: string;
    data: {
        totalCount: number;
        clinics: {
            id: number;
            title: string;
            address: string;
            phone: string;
            city_id: number;
            start_time: string;
            end_time: string;
            internet_address: string;
            guest_client_id: number;
            time_zone: string;
            logo_url: string;
            status: string;
            telegram: string;
            whatsapp: string;
            email: string;
        }[];
    };
}