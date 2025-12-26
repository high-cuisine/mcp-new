import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthUserRto {
	@ApiProperty({
		example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
		description: 'JWT токен доступа',
	})
	accessToken: string;
}
