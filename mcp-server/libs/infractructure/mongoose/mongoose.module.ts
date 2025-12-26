import { Module } from "@nestjs/common";
import { MongooseModule as Mongoose } from "@nestjs/mongoose";
import { cfg } from "@common/config/config.service";

@Module({
    imports: [Mongoose.forRootAsync({
        useFactory: () => ({
            uri: `mongodb://${cfg.mongo.username}:${cfg.mongo.password}@${cfg.mongo.host}:${cfg.mongo.port}/${cfg.mongo.dbName}?authSource=admin`,
            dbName: cfg.mongo.dbName,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        }),
    })],
})
export class MongooseModule {}