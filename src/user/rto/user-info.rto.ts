import { ApiProperty } from "@nestjs/swagger";

export class UserInfoRto {

    @ApiProperty({ description: 'ID пользователя' })        
    user_id: number;

    @ApiProperty({ description: 'Email пользователя' })
    email: string;

    @ApiProperty({ description: 'Статус KYC пользователя' })
    kyc_status: string;
}