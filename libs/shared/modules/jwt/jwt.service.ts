import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { cfg } from "@common/config/config.service";
import { TokenPayload } from "./interfaces/token.interface";

@Injectable()
export class JwtServiceCustom {
    constructor(private readonly jwtService: JwtService) {}

    async signTokens(userId: number, username: string) {
		const accessToken = this.jwtService.sign(
			{
				sub: userId,
				username: username,
			},
		);

		const refreshToken = this.jwtService.sign(
			{
				sub: userId,
				username: username,
			},
		);

		return { accessToken, refreshToken };
	}

    private async generateToken(payload: TokenPayload, type: 'access' | 'refresh') {
		return this.jwtService.sign(payload, {
			secret: type === 'access' ? cfg.jwt.accessTokenSecret : cfg.jwt.refreshTokenSecret,
			expiresIn: type === 'access' ? cfg.jwt.accessTokenExpiresIn : cfg.jwt.refreshTokenExpiresIn,
		});
	}

	async generateAccessToken(payload: TokenPayload) {
		return this.generateToken(payload, 'access');
	}

	async generateRefreshToken(payload: TokenPayload) {
		return this.generateToken(payload, 'refresh');
	}

	async verifyToken(token: string, type: 'access' | 'refresh'): Promise<TokenPayload> {
		return this.jwtService.verify(token, {
			secret: type === 'access' ? cfg.jwt.accessTokenSecret : cfg.jwt.refreshTokenSecret,
		});
	}

	async decodeToken(token: string) {
		return this.jwtService.decode(token);
	}

	async generateTokens(payload: TokenPayload) {
		const accessToken = await this.generateAccessToken(payload);
		const refreshToken = await this.generateRefreshToken(payload);
		return { accessToken, refreshToken };
	}

	async verifyRefreshToken(token: string) {
		return this.verifyToken(token, 'refresh');
	}
}