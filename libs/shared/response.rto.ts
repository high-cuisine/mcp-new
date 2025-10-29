import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseRto<T> {
	@ApiProperty({ example: true })
	success: boolean;

	@ApiProperty()
	data: T;
}
