import { Module } from '@nestjs/common';
import { WebRagService } from './service/web-rag.service';
import { ChromRagService } from './service/chrom-rag.service';
import { ChromRagInitService } from './service/chrom-rag-init.service';

@Module({
  providers: [WebRagService, ChromRagService, ChromRagInitService],
  exports: [WebRagService, ChromRagService],
})
export class RagModule {}

