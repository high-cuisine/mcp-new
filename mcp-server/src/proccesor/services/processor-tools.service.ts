import { Injectable } from "@nestjs/common";
import { ChatMsg } from "../interface/chat.interface";
import { ClientRepository } from "src/client/repositorys/client.repository";
import { ChromRagService } from "@infra/rag/service/chrom-rag.service";
import { KnowledgeService } from "./knowledge.service";
import { DoctorSlotsService } from "./doctor-slots.service";
import {
    isNegativeResponse,
    buildModeratorResponse,
    extractServiceName,
    notifyModeratorServiceQuery,
    MODERATOR_MESSAGE,
} from "../helpers/message.helper";
import { parseToolArgs } from "../helpers/format.helper";
import { isServiceQuery, hasPriceIntent } from "../helpers/intent.helper";

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
    ) {}

    async handleToolCall(functionName: string, argsJson: string, ctx: ToolCallContext): Promise<ToolCallResult> {
        const args = parseToolArgs<Record<string, string>>(argsJson);
        const { lastMessage, validMessages, telegramId } = ctx;

        if (functionName === 'search_web') {
            return buildModeratorResponse(`❗️ Пользователь задал вопрос, требующий помощи модератора.\nЗапрос: ${args.query}`);
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
                return buildModeratorResponse(`❗️ Запрос по врачу/расписанию, бот не нашёл данных.\nЗапрос: ${lastMessage}\nОтвет системы: ${slotsResult}`);
            }
            return { type: 'text', content: slotsResult };
        }

        if (functionName === 'get_appointment_slots') {
            const slotsResult = await this.doctorSlotsService.getDoctorAvailableSlots(args.doctor_last_name, args.date, args.appointment_type);
            if (isNegativeResponse(slotsResult)) {
                return buildModeratorResponse(`❗️ Запрос по слотам/расписанию, бот не нашёл данных.\nЗапрос: ${lastMessage}\nОтвет системы: ${slotsResult}`);
            }
            return { type: 'text', content: slotsResult };
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
        let knowledgeResult: string;
        try {
            knowledgeResult = await this.knowledgeService.searchKnowledgeBase(query);
        } catch {
            return buildModeratorResponse(`❗️ Пользователь задал вопрос, требующий помощи модератора.\nЗапрос: ${query}`);
        }
        if (isNegativeResponse(knowledgeResult)) {
            return buildModeratorResponse(`❗️ Бот не нашёл подходящего ответа в базе знаний.\nЗапрос: ${query}\nОтвет системы: ${knowledgeResult}`);
        }

        const isService = isServiceQuery(query);
        const hasPrice = hasPriceIntent(query);
        if (isService && hasPrice) {
            const serviceName = extractServiceName(query);
            const priceResult = await this.knowledgeService.searchPrice(serviceName);
            if (!isNegativeResponse(priceResult)) {
                return { type: 'text', content: priceResult };
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
                return { type: 'text', content: knowledgeResult + priceInfo };
            }
            return buildModeratorResponse(notifyModeratorServiceQuery(lastMessage || query));
        }

        if (isService && !hasPrice) {
            if (isNegativeResponse(knowledgeResult)) {
                return buildModeratorResponse(notifyModeratorServiceQuery(lastMessage || query));
            }
            return { type: 'text', content: knowledgeResult, notifyModerator: notifyModeratorServiceQuery(lastMessage || query) };
        }

        if (isNegativeResponse(knowledgeResult)) {
            return buildModeratorResponse(`❗️ Бот не нашёл подходящего ответа в базе знаний.\nЗапрос: ${query}`);
        }
        return { type: 'text', content: knowledgeResult };
    }

    private async handleSearchServicePrice(serviceName: string, lastMessage: string): Promise<ToolCallResult> {
        const hasPrice = hasPriceIntent(lastMessage) || hasPriceIntent(serviceName);
        if (!hasPrice) {
            try {
                const knowledgeResult = await this.knowledgeService.searchKnowledgeBase(serviceName || lastMessage);
                if (isNegativeResponse(knowledgeResult)) {
                    return buildModeratorResponse(`❗️ Бот не нашёл подходящего ответа.\nЗапрос: ${serviceName || lastMessage}`);
                }
                return { type: 'text', content: knowledgeResult };
            } catch {
                return buildModeratorResponse(`❗️ Пользователь задал вопрос, требующий помощи модератора.\nЗапрос: ${serviceName || lastMessage}`);
            }
        }
        const priceResult = await this.knowledgeService.searchPrice(serviceName);
        if (!isNegativeResponse(priceResult)) {
            return { type: 'text', content: priceResult };
        }
        return buildModeratorResponse(notifyModeratorServiceQuery(lastMessage || serviceName));
    }
}
