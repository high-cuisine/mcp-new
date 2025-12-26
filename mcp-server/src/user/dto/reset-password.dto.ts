import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class ResetPasswordDto {
	@IsEmail()
	@IsNotEmpty()
	email: string;
}

export class AcceptResetPasswordDto {
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@IsString()
	@IsNotEmpty()
	code: string;

	@IsString()
	@IsNotEmpty()
	password: string;
}