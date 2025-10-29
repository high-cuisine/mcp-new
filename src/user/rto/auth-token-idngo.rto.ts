import { ApiProperty } from "@nestjs/swagger";

export class AuthTokenIdngoRto {
    @ApiProperty({
        description: 'токен для доступа к api idngo',
        example: '1234567890',
    })
    token: string;
    
    @ApiProperty({
        description: 'айди юзера в системе idngo - email его ',
        example: 'example@example.com',
    })
    userId: string;
}