import { FastifyRequest } from 'fastify';

export interface IRequest extends FastifyRequest {
	user?: {
		sub: number;
		username: string;
		iat?: number;
		exp?: number;
	};
}
