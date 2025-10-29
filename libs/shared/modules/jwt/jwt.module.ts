import { cfg } from "@common/config/config.service";
import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtServiceCustom } from "./jwt.service";

@Global()
@Module({
    imports: [
        JwtModule.register({
			secret: cfg.jwt.accessTokenSecret,
			signOptions: { expiresIn: cfg.jwt.accessTokenExpiresIn },
		})
    ],
    providers: [JwtServiceCustom],
    exports: [JwtServiceCustom, JwtModule],
})
export class JwtModuleCustom {}