import { Module } from "@nestjs/common";
import { ProccesorService } from "./services/proccesor.service";
import { CrmModule } from "src/crm/crm.module";

@Module({
    imports: [CrmModule],
    controllers: [],
    providers: [ProccesorService],
    exports: [ProccesorService]
})
export class ProccesorModule {}