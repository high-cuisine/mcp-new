import { IsNotEmpty, IsString, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginUserDto {

  @ApiProperty({ 
    example: 'john', 
    description: 'Логин пользователя' 
  })
  @IsString()
  @IsNotEmpty()
  login: string;

  @ApiProperty({ 
    example: 'password123', 
    description: 'Пароль пользователя (6-20 символов)' 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(20)
  password: string;

}