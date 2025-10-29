import { BadRequestException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { RegisterUserDto } from '../dto/register.dto';
import { LoginUserDto } from '../dto/login.dto';
import { cfg } from '@common/config/config.service';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '@infra/redis/redis.service';
import { JwtServiceCustom } from 'libs/shared/modules/jwt/jwt.service';
import { ResendCodeRto } from '../rto/resend-code.rto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserSchema } from '../schemas/UserShema';
import { TelegramTokenDto } from '../dto/telegram-token.dto';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly jwtService: JwtServiceCustom,
        @InjectModel('User') private readonly userModel: Model<typeof UserSchema>,
    ) {}

	private async signTokens(userId: number, username: string) {
		const accessToken = this.jwtService.signTokens(userId, username);

		const refreshToken = this.jwtService.signTokens(userId, username);

		return { accessToken, refreshToken };
	}

    async registerV2(body: RegisterUserDto) {
        const existing = await this.userModel.findOne({ email: body.email });
        if (existing) {
            throw new BadRequestException('User already exists');
        }
        const passwordHash = await bcrypt.hash(body.password, 10);
        const created = await this.userModel.create({
            email: body.email,
            password: passwordHash,
            created_at: new Date(),
            updated_at: new Date(),
            tokensTelegram: [],
        });
        const tokens = await this.signTokens(created.id, body.email);
        return tokens;
    }


    async login(body: LoginUserDto) {
        const user = await this.userModel.findOne({ login: body.login }) || await this.userModel.findOne({ email: body.login });
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        const ok = await bcrypt.compare(body.password, (user as any).password);
        if (!ok) {
            throw new UnauthorizedException('Invalid credentials');
        }
        const tokens = await this.signTokens((user as any).id, (user as any).email ?? body.login);
        return tokens;
    }

	async refreshToken(refreshToken: string) {

	}

	async resetPassword(email: string) {

	}

	async uploadTelegramToken(userId: string, tokenData: TelegramTokenDto) {
		const user = await this.userModel.findById(userId);
		if (!user) {
			throw new UnauthorizedException('User not found');
		}

		// Add token to tokensTelegram array
		await this.userModel.findByIdAndUpdate(
			userId,
			{ $push: { tokensTelegram: tokenData.token } },
			{ new: true }
		);

		return { message: 'Telegram token uploaded successfully' };
	}

}
