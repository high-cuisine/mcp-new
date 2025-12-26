import { IsNotEmpty, IsString, IsEmail, Length, Matches, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ResendCodeDto {

  @ApiProperty({ 
    example: 'john@example.com', 
    description: 'Email адрес' 
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;


}