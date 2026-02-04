import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { ChromRagService } from "@infra/rag/service/chrom-rag.service";
import { LlmResponseDto } from "../dto/llm-response.dto";
import { ragRelevancePrompt } from "../constants/helpingPrompts/ragRelevance.prompt";
import { formatCandidatesForPrompt } from "../helpers/format.helper";

@Injectable()
export class KnowledgeService {
    private readonly openai: OpenAI;

    constructor(private readonly chromRagService: ChromRagService) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    /** Поиск в базе знаний + LLM для выбора релевантных позиций и формирования ответа */
    async searchKnowledgeBase(query: string): Promise<string> {
        const candidates = await this.chromRagService.searchCandidates(query, 8, 1.4);
        if (!candidates || candidates.length === 0) {
            throw new Error('KNOWLEDGE_BASE_NOT_FOUND');
        }

        const candidatesText = formatCandidatesForPrompt(candidates);
        const prompt = ragRelevancePrompt
            .replace('{user_question}', query)
            .replace('{candidates_text}', candidatesText);

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: `Вопрос пользователя: ${query}` },
            ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            max_tokens: 500,
            temperature: 0.2,
        }) as LlmResponseDto;

        const answer = response.choices[0].message.content?.trim();
        if (!answer) throw new Error('KNOWLEDGE_BASE_NOT_FOUND');
        return answer;
    }

    /** Поиск цен на услугу в ChromRAG, форматирование ответа */
    async searchPrice(serviceName: string): Promise<string> {
        const result = await this.chromRagService.searchForPrice(serviceName);
        if (!result) {
            return `Информация о ценах на "${serviceName}" не найдена.`;
        }

        if (result.type === 'exact') {
            return `Стоимость услуги "${result.service_name}" (${result.category}): ${result.price_str}`;
        }
        if (result.type === 'range') {
            const services = result.services as Array<{ name: string; category: string; price: number }>;
            const categories = [...new Set(services.map(s => s.category))];
            const prices = [...new Set(services.map(s => s.price))];
            if (categories.length === 1 && prices.length === 1) {
                return `Стоимость услуги "${services[0].name}" (${services[0].category}): ${prices[0]} руб`;
            }
            let text = `Найдено несколько вариантов услуги "${serviceName}":\n\nДиапазон цен: ${result.price_str}\n\nВарианты:\n`;
            services.forEach(s => { text += `• ${s.name} (${s.category}): ${s.price} руб\n`; });
            return text;
        }

        return `Информация о ценах на "${serviceName}" не найдена. Могу помочь вам записаться на прием для уточнения стоимости.`;
    }
}
