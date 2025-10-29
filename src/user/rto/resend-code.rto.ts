import { ApiProperty } from "@nestjs/swagger";

export class ResendCodeRto {

    @ApiProperty({
        example: 'code resent',
        description: 'Сообщение о том, что код был отправлен'
    })
    message: string;
    
}