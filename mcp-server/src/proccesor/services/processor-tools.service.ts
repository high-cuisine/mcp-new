import { Injectable } from "@nestjs/common";
import { ChatMsg } from "../interface/chat.interface";
import { ClientRepository } from "src/client/repositorys/client.repository";
import { ChromRagService } from "@infra/rag/service/chrom-rag.service";
import { KnowledgeService } from "./knowledge.service";
import { DoctorSlotsService } from "./doctor-slots.service";
import { WebSearchService } from "./web-search.service";
import {
    isNegativeResponse,
    stripSceneNames,
    buildModeratorResponse,
    askManagerResponse,
    extractServiceName,
    MODERATOR_MESSAGE,
} from "../helpers/message.helper";
import { parseToolArgs } from "../helpers/format.helper";
import { isServiceQuery, hasPriceIntent, isAvailabilityQuery } from "../helpers/intent.helper";

export type ToolCallResult = { type: string; content?: string; notifyModerator?: string };

export interface ToolCallContext {
    lastMessage: string;
    validMessages: ChatMsg[];
    telegramId?: string;
}

@Injectable()
export class ProcessorToolsService {
    constructor(
        private readonly knowledgeService: KnowledgeService,
        private readonly doctorSlotsService: DoctorSlotsService,
        private readonly chromRagService: ChromRagService,
        private readonly clientRepository: ClientRepository,
        private readonly webSearchService: WebSearchService,
    ) {}

    async handleToolCall(functionName: string, argsJson: string, ctx: ToolCallContext): Promise<ToolCallResult> {
        const args = parseToolArgs<Record<string, string>>(argsJson);
        const { lastMessage, validMessages, telegramId } = ctx;

        if (functionName === 'search_web') {
            try {
                const query = args.query || lastMessage;
                const content = await this.webSearchService.search(query);
                return { type: 'text', content: stripSceneNames(content || askManagerResponse().content) };
            } catch {
                return askManagerResponse();
            }
        }

        if (functionName === 'search_knowledge_base') {
            return this.handleSearchKnowledgeBase(args.query || '', lastMessage, validMessages);
        }

        if (functionName === 'search_service_price') {
            return this.handleSearchServicePrice(args.service_name || lastMessage, lastMessage);
        }

        if (functionName === 'get_doctor_available_slots') {
            const slotsResult = await this.doctorSlotsService.getDoctorAvailableSlots(args.doctor_name, args.date);
            if (isNegativeResponse(slotsResult)) {
                return askManagerResponse();
            }
            return { type: 'text', content: stripSceneNames(slotsResult) };
        }

        if (functionName === 'get_appointment_slots') {
            const slotsResult = await this.doctorSlotsService.getDoctorAvailableSlots(args.doctor_last_name, args.date, args.appointment_type);
            if (isNegativeResponse(slotsResult)) {
                return askManagerResponse();
            }
            return { type: 'text', content: stripSceneNames(slotsResult) };
        }

        if (functionName === 'call_moderator') {
            const reason = args.reason || 'Клиент запросил помощь модератора';
            const lastUserMessage = validMessages.filter(m => m.role === 'user').pop()?.content || '';
            let clientInfo = '';
            if (telegramId) {
                try {
                    const client = await this.clientRepository.findByTelegramId(telegramId);
                    if (client) {
                        const obj = client.toObject ? client.toObject() : (client as any);
                        clientInfo = `\n\n📋 Информация о клиенте:\n• Telegram ID: ${telegramId}\n`;
                        if (obj.telegram_name) clientInfo += `• Имя: ${obj.telegram_name}\n`;
                        if (obj.telegram_number) clientInfo += `• Телефон: ${obj.telegram_number}\n`;
                        if (obj.whatsapp_number) clientInfo += `• WhatsApp: ${obj.whatsapp_number}\n`;
                        if (obj.crm_client_id) clientInfo += `• CRM ID: ${obj.crm_client_id}\n`;
                    }
                } catch (e) {
                    console.error('Ошибка при получении информации о клиенте:', e);
                }
            }
            const moderatorMessage = `🔔 ВЫЗОВ МОДЕРАТОРА\n\nПричина: ${reason}${lastUserMessage ? `\n\nПоследнее сообщение клиента: "${lastUserMessage}"` : ''}${clientInfo}`;
            return { type: 'text', content: MODERATOR_MESSAGE, notifyModerator: moderatorMessage };
        }

        return { type: functionName, content: '' };
    }

    private async handleSearchKnowledgeBase(query: string, lastMessage: string, validMessages: ChatMsg[]): Promise<ToolCallResult> {
        const effectiveQuery = query || lastMessage;
        const useWiderSearch = isAvailabilityQuery(effectiveQuery);
        let knowledgeResult: string;
        try {
            knowledgeResult = useWiderSearch
                ? await this.knowledgeService.searchKnowledgeBaseForAvailability(effectiveQuery)
                : await this.knowledgeService.searchKnowledgeBase(effectiveQuery);
        } catch {
            return askManagerResponse();
        }
        if (isNegativeResponse(knowledgeResult)) {
            return askManagerResponse();
        }

        const isService = isServiceQuery(effectiveQuery);
        const hasPrice = hasPriceIntent(effectiveQuery);
        if (isService && hasPrice) {
            const serviceName = extractServiceName(effectiveQuery);
            const priceResult = await this.knowledgeService.searchPrice(serviceName, effectiveQuery);
            if (!isNegativeResponse(priceResult)) {
                return { type: 'text', content: stripSceneNames(priceResult) };
            }
            const mainServices = ['вакцинация', 'груминг', 'прием врача', 'УЗИ', 'рентген', 'анализ крови'];
            let priceInfo = '\n\n**Цены на основные услуги:**\n';
            let foundPrices = false;
            for (const service of mainServices) {
                const pr = await this.chromRagService.searchForPrice(service, 3, 1.4);
                if (pr?.type === 'exact') {
                    priceInfo += `• ${pr.service_name}: ${pr.price_str}\n`;
                    foundPrices = true;
                } else if (pr?.type === 'range') {
                    priceInfo += `• ${service}: ${pr.price_str}\n`;
                    foundPrices = true;
                }
            }
            if (foundPrices) {
                return { type: 'text', content: stripSceneNames(knowledgeResult + priceInfo) };
            }
            return askManagerResponse();
        }

        if (isService && !hasPrice) {
            if (isNegativeResponse(knowledgeResult)) {
                return askManagerResponse();
            }
            return { type: 'text', content: stripSceneNames(knowledgeResult) };
        }

        if (isNegativeResponse(knowledgeResult)) {
            return askManagerResponse();
        }
        return { type: 'text', content: stripSceneNames(knowledgeResult) };
    }

    private async handleSearchServicePrice(serviceName: string, lastMessage: string): Promise<ToolCallResult> {
        const hasPrice = hasPriceIntent(lastMessage) || hasPriceIntent(serviceName);
        if (!hasPrice) {
            try {
                const knowledgeResult = await this.knowledgeService.searchKnowledgeBase(serviceName || lastMessage);
                if (isNegativeResponse(knowledgeResult)) {
                    return askManagerResponse();
                }
                return { type: 'text', content: stripSceneNames(knowledgeResult) };
            } catch {
                return askManagerResponse();
            }
        }
        const priceResult = await this.knowledgeService.searchPrice(serviceName, lastMessage);
        if (!isNegativeResponse(priceResult)) {
            return { type: 'text', content: stripSceneNames(priceResult) };
        }
        return askManagerResponse();
    }
}
