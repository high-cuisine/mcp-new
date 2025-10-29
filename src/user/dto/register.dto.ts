import { IsNotEmpty, IsString, MinLength, MaxLength, IsPhoneNumber, IsEmail } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterUserDto {
  @ApiProperty({ 
    example: 'john_doe',
    description: 'Логин пользователя (3-15 символов)' 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(15)
  login: string;

  @ApiProperty({ 
    example: '+79001234567', 
    description: 'Номер телефона в международном формате' 
  })
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber(undefined)
  phone: string;

  @ApiProperty({ 
    example: 'password123', 
    description: 'Пароль (6-20 символов)' 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(20)
  password: string;

  @ApiProperty({ 
    example: 'john@example.com', 
    description: 'Email адрес' 
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;
}