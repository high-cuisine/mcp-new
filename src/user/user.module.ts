import { Module } from '@nestjs/common';
import { MongooseModule as Mongoose } from '@nestjs/mongoose';
import { UserSchema } from './schemas/UserShema';

@Module({
	imports: [
        Mongoose.forFeature([{ name: 'User', schema: UserSchema }]),
		
	],
	controllers: [],
	providers: [],
	exports: [],
})
export class UserModule {}
