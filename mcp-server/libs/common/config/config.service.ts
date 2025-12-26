import appConfig from "./configs/app.config";
import telegramConfig from "./configs/telegram.config";
import redisConfig from "./configs/redis.config";
import mongoConfig from "./configs/mongo.config";
import jwtConfig from "./configs/jwt.config";


export class cfg {
    public static get app() {
        return appConfig();
    }
    public static get telegram() {
        return telegramConfig();
    }
    public static get redis() {
        return redisConfig();
    }

    public static get mongo() {
        return mongoConfig();
    }

    public static get jwt() {
        return jwtConfig();
    }
}