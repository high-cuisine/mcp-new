import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { cfg } from '@common/config/config.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
	constructor(private readonly jwtService: JwtService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest();
		const authHeader = request.headers.authorization;

		if (!authHeader) {
			throw new UnauthorizedException('Authorization header is required');
		}

		const [bearer, token] = authHeader.split(' ');

		if (bearer !== 'Bearer' || !token) {
			throw new UnauthorizedException('Invalid token format');
		}

		try {
			const payload = this.jwtService.verify(token, {
				secret: cfg.jwt.accessTokenSecret,
			});

			request.user = payload;
			
			return true;
		} catch (error) {
			throw new UnauthorizedException('Invalid token');
		}
	}
} 