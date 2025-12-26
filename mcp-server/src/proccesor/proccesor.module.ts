import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule as Mongoose } from "@nestjs/mongoose";
import { ProccesorService } from "./services/proccesor.service";
import { CrmModule } from "src/crm/crm.module";
import { RagModule } from "@infra/rag/rag.module";
import { RedisModule } from "@infra/redis/redis.module";
import { ClinicRules, ClinicRulesSchema } from "./schemas/clinic-rules.schema";

@Module({
    imports: [
        forwardRef(() => CrmModule),
        RagModule,
        RedisModule,
        Mongoose.forFeature([{ name: ClinicRules.name, schema: ClinicRulesSchema }]),
    ],
    controllers: [],
    providers: [ProccesorService],
    exports: [ProccesorService]
})
export class ProccesorModule {}
