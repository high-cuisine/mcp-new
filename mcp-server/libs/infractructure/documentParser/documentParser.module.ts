import { Module } from "@nestjs/common";
import { DocumentParserService } from "./services/documentParser.service";
import { GettingDocumentInfoService } from "./services/gettingDocumentInfo.service";
import { RedisModule } from "@infra/redis/redis.module";

@Module({
    imports:[RedisModule],
    providers:[DocumentParserService, GettingDocumentInfoService],
    exports:[DocumentParserService, GettingDocumentInfoService]
})
export class DocumentParser {}