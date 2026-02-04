import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { WebRagService } from "@infra/rag/service/web-rag.service";
import { helpPrompt } from "../constants/help.prompt";
import { LlmResponseDto } from "../dto/llm-response.dto";

@Injectable()
export class WebSearchService {
    private readonly openai: OpenAI;

    constructor(private readonly webRagService: WebRagService) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    /** Поиск в интернете + формирование ответа через LLM (helpPrompt) */
    async search(query: string): Promise<string> {
        const info = await this.webRagService.search(query);
        const webInfoText = Array.isArray(info) ? info.join('\n\n') : JSON.stringify(info);
        const prompt = helpPrompt.replace('{web_info}', webInfoText).replace('{client_query}', query);
        const messagesReq = [
            { role: 'system', content: prompt },
            { role: 'user', content: query },
        ];
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        }) as LlmResponseDto;
        return response.choices[0].message.content ?? '';
    }
}
