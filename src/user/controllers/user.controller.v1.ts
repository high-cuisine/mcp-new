import { Controller, UseGuards, Req, UnauthorizedException, Get } from '@nestjs/common';
import { IRequest } from '@shared/types/request';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserService } from '../services/user.service';
import { UserInfoRto } from '../rto/user-info.rto';

@ApiTags('User')
@Controller({
	path: 'v1/users',
	version: '1',
})
export class UserControllerV1 {

        constructor(private readonly userService: UserService) {}

    
}
