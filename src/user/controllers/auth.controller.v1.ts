import { Body, Controller, Post, Req, Res, UnauthorizedException, UseGuards, UseInterceptors, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { RegisterUserDto } from '../dto/register.dto';
import { LoginUserDto } from '../dto/login.dto';
import { AuthUserRto } from '../rto/auth.rto';
import { ApiSuccessResponse } from '@shared/decorators';
import { EmailConfirmDto } from '../dto/email-confirm.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { TelegramTokenDto } from '../dto/telegram-token.dto';

@ApiTags('[v1] Пользователь - аутентификация')
@Controller({
	path: 'v1/auth',
	version: '1',
})
export class AuthControllerV1 {
	constructor(private readonly authService: AuthService) {}

	@ApiOperation({ summary: 'Регистрация' })
	@Post('register')
	async register(@Body() body: RegisterUserDto) {
		return await this.authService.registerV2(body);
	}

	@ApiOperation({ summary: 'Логин' })
	@Post('login')
	async login(@Body() body: LoginUserDto) {
		return await this.authService.login(body);
	}

	@ApiOperation({ summary: 'Загрузка токена Telegram бота' })
	@Post('telegram-token')
	async uploadTelegramToken(@Body() body: TelegramTokenDto, @Req() req: any) {
		// Extract user ID from JWT token (assuming it's in req.user after authentication)
		const userId = req.user?.id || req.user?.sub;
		if (!userId) {
			throw new UnauthorizedException('User not authenticated');
		}
		return await this.authService.uploadTelegramToken(userId, body);
	}
}
