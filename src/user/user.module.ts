import { Module } from '@nestjs/common';
import { MongooseModule as Mongoose } from '@nestjs/mongoose';
import { AuthControllerV1 } from './controllers/auth.controller.v1';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { UserControllerV1 } from './controllers/user.controller.v1';
import { JwtModuleCustom } from '@shared/modules/jwt/jwt.module';
import { UserSchema } from './schemas/UserShema';

@Module({
	imports: [
        Mongoose.forFeature([{ name: 'User', schema: UserSchema }]),
        JwtModuleCustom,
		
	],
	controllers: [AuthControllerV1, UserControllerV1],
	providers: [
		AuthService,
		UserService,
	],
	exports: [AuthService, UserService ],
})
export class UserModule {}
