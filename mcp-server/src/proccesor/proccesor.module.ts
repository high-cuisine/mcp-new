import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule as Mongoose } from "@nestjs/mongoose";
import { ProccesorService } from "./services/proccesor.service";
import { KnowledgeService } from "./services/knowledge.service";
import { DoctorSlotsService } from "./services/doctor-slots.service";
import { ProcessorToolsService } from "./services/processor-tools.service";
import { WebSearchService } from "./services/web-search.service";
import { CrmModule } from "src/crm/crm.module";
import { ClientModule } from "src/client/client.module";
import { RagModule } from "@infra/rag/rag.module";
import { RedisModule } from "@infra/redis/redis.module";
import { ClinicRules, ClinicRulesSchema } from "./schemas/clinic-rules.schema";

@Module({
    imports: [
        forwardRef(() => CrmModule),
        ClientModule,
        RagModule,
        RedisModule,
        Mongoose.forFeature([{ name: ClinicRules.name, schema: ClinicRulesSchema }]),
    ],
    controllers: [],
    providers: [ProccesorService, KnowledgeService, DoctorSlotsService, ProcessorToolsService, WebSearchService],
    exports: [ProccesorService]
})
export class ProccesorModule {}
