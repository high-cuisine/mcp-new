import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TelegramTokenDto {
  @ApiProperty({ 
    example: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', 
    description: 'Telegram bot token' 
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
