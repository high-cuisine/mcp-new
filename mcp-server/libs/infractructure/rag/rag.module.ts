import { Module } from '@nestjs/common';
import { WebRagService } from './service/web-rag.service';
import { ChromRagService } from './service/chrom-rag.service';
import { ChromRagInitService } from './service/chrom-rag-init.service';
import { CheckListService } from './service/check-list.service';

@Module({
  providers: [WebRagService, ChromRagService, ChromRagInitService, CheckListService],
  exports: [WebRagService, ChromRagService, CheckListService],
})
export class RagModule {}

