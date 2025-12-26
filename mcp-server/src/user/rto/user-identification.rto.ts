import { ApiProperty } from '@nestjs/swagger';

export class UserIdentificationRto { //отдаем imex
    @ApiProperty({
        description: 'Токен доступа для идентификации пользователя',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    })
    accessToken: string;
}