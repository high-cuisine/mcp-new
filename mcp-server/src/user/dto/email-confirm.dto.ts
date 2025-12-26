import { IsNotEmpty, IsString, IsEmail, Length, Matches, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class EmailConfirmDto {

  @ApiProperty({ 
    example: 'john@example.com', 
    description: 'Email адрес' 
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ 
    example: '123456', 
    description: 'Код подтверждения (6 цифр)' 
  })
  @IsNumber()
  @IsNotEmpty()
  code: string;

}