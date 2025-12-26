import { Module } from "@nestjs/common";
import { MongooseModule as Mongoose } from "@nestjs/mongoose";
import { ClientSchema } from "./schemas/Client.shema";

import { ClientRepository } from "./repositorys/client.repository";

@Module({
    imports: [Mongoose.forFeature([{ name: 'User', schema: ClientSchema }])],
    controllers: [],
    providers: [ClientRepository],
    exports: [ClientRepository]
})
export class ClientModule {}