import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import OpenAI from "openai";
import { systemPrompt } from "../constants/system.prompt";
import { ChatMsg } from "../interface/chat.interface";
import tools from "../tools/tools";
import toolsAppointmentSlots from "../tools/toolsAppointmentSlots";
import { LlmResponseDto } from "../dto/llm-response.dto";
import { findServicePrompt } from "../constants/helpingPrompts/findService.prompt";
import { findDoctorPrompt } from "../constants/helpingPrompts/findDoctorPrompt.prompt";
import { ServicesService } from "src/crm/services/services.service";
import { DoctorService } from "src/crm/services/doctor.service";
import { WebSearchService } from "./web-search.service";
import { ClinicRulesJson } from "../interface/clinic-rules-json.interface";
import { ClinicRules, ClinicRulesDocument } from "../schemas/clinic-rules.schema";
import { wordPrompt } from "../constants/helpingPrompts/word.prompt";
import { checkingToExitFromScenePrompt } from "../constants/technicalPrompt/checkingToExitFromScene.prompt";
import { ProcessorToolsService, ToolCallContext } from "./processor-tools.service";
import { KnowledgeService } from "./knowledge.service";
import { DoctorSlotsService } from "./doctor-slots.service";
import {
    truncate,
    isNegativeResponse,
    extractServiceName,
    askManagerResponse,
    getLastMessageContent,
} from "../helpers/message.helper";
import { detectQuickIntent, hasPriceIntent, isServiceQuery, isSymptomsOrPetProblem } from "../helpers/intent.helper";

const SYMPTOMS_APPOINTMENT_SUGGESTION = '\n\nДавайте запишемся на приём — врач осмотрит питомца и даст точные рекомендации. Напишите «записаться» для записи.';

@Injectable()
export class ProccesorService {
    private readonly openai: OpenAI;
    telegramService: any;

    constructor(
        private readonly servicesService: ServicesService,
        private readonly doctorService: DoctorService,
        private readonly knowledgeService: KnowledgeService,
        private readonly processorToolsService: ProcessorToolsService,
        private readonly doctorSlotsService: DoctorSlotsService,
        private readonly webSearchService: WebSearchService,
        @InjectModel(ClinicRules.name) private readonly clinicRulesModel: Model<ClinicRulesDocument>,
    ) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    async sendMessage(messages: ChatMsg[], telegramId?: string) {
        const validMessages = messages.filter(msg => msg.role && msg.content).slice(-8);
        if (validMessages.length === 0) {
            throw new Error('No valid messages provided');
        }
        
        const lastMessage = getLastMessageContent(validMessages);
        const quickIntent = detectQuickIntent(lastMessage);
        if (quickIntent) {
            return { type: quickIntent, content: '' };
        }

        if (isSymptomsOrPetProblem(lastMessage)) {
            const symptomsResult = await this.handleSymptomsOrPetProblem(lastMessage);
            if (symptomsResult) {
                return { type: 'text', content: symptomsResult };
            }
        }

        const priceIntent = hasPriceIntent(lastMessage);
        const serviceQuery = isServiceQuery(lastMessage);
        
        const messagesReq = [{ role: 'system', content: systemPrompt }, ...validMessages];
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            tools: [...tools, ...toolsAppointmentSlots] as OpenAI.Chat.Completions.ChatCompletionTool[],
            tool_choice: "auto"
        }) as LlmResponseDto;

        const toolCalls = response.choices[0].message.tool_calls;
        const calledPriceSearch = toolCalls?.some(tc => tc.function.name === 'search_service_price');

        if (serviceQuery && priceIntent && !calledPriceSearch) {
            const serviceName = extractServiceName(lastMessage);
            const priceResult = await this.knowledgeService.searchPrice(serviceName);
            if (!isNegativeResponse(priceResult)) {
                return { type: 'text', content: priceResult };
            }
            return askManagerResponse();
        }

        if (toolCalls?.length) {
            const toolCall = toolCalls[0];
            const functionName = toolCall.function.name;
            if (['create_appointment', 'move_appointment', 'cancel_appointment', 'show_appointment'].includes(functionName)) {
                return { type: functionName, content: '' };
            }
            const ctx: ToolCallContext = { lastMessage, validMessages, telegramId };
            return this.processorToolsService.handleToolCall(functionName, toolCall.function.arguments || '{}', ctx);
        }

        const llmContent = response.choices[0].message.content?.trim() || '';
        if (isNegativeResponse(llmContent)) {
            return askManagerResponse();
        }
        return { type: 'text', content: llmContent };
    }

    /** При симптомах/описании проблемы с питомцем: RAG + интернет, затем предложение записаться */
    private async handleSymptomsOrPetProblem(query: string): Promise<string | null> {
        let knowledgeText = '';
        let webText = '';
        try {
            const result = await this.knowledgeService.searchKnowledgeBase(query);
            if (result && !isNegativeResponse(result)) {
                knowledgeText = result;
            }
        } catch {
            // база знаний не ответила — используем только интернет
        }
        try {
            const result = await this.webSearchService.search(query);
            if (result && result.trim()) {
                webText = result.trim();
            }
        } catch {
            // веб-поиск не сработал
        }
        if (!knowledgeText && !webText) {
            return null;
        }
        const parts: string[] = [];
        if (knowledgeText) {
            parts.push('По базе знаний клиники:\n\n' + knowledgeText);
        }
        if (webText) {
            parts.push('Информация из открытых источников:\n\n' + webText);
        }
        return parts.join('\n\n---\n\n') + SYMPTOMS_APPOINTMENT_SUGGESTION;
    }

    async getLatestClinicRules(): Promise<ClinicRulesJson | null> {
        if (!this.clinicRulesModel) return null;
        const doc = await this.clinicRulesModel.findOne().sort({ createdAt: -1 }).lean();
        return (doc as any)?.content || null;
    }

    async parseClinicRules(rawText: string, meta?: { fileName?: string; mimeType?: string }): Promise<ClinicRulesJson> {
        const text = truncate(rawText, 20000);
        const messagesReq = [
            { role: 'system', content: wordPrompt },
            { role: 'user', content: text },
        ];
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            max_tokens: 2000,
            temperature: 0.2,
        }) as LlmResponseDto;
        let parsed: ClinicRulesJson;
        try {
            parsed = JSON.parse(response.choices[0].message.content || "{}");
        } catch (e) {
            throw new Error(`Failed to parse clinic rules JSON: ${e}`);
        }
        if (this.clinicRulesModel) {
            await this.clinicRulesModel.create({
                content: parsed,
                rawText: text,
                fileName: meta?.fileName,
                mimeType: meta?.mimeType,
            });
        }
        return parsed;
    }

    async findDoctorAndServiceForAppointment(userService: string) {
        const servicesList = await this.servicesService.getServices();
        const messagesReq = [
            { role: 'system', content: findServicePrompt.replace('{services_list}', servicesList.join('\n')) },
            { role: 'user', content: userService }
        ];
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        }) as LlmResponseDto;
        return response.choices[0].message.content;
    }

    async findDoctorForAppointment(userService: string) {
        const doctorsList = await this.doctorService.getDoctors();
        const messagesReq = [
            { role: 'system', content: findDoctorPrompt.replace('{doctors_list}', JSON.stringify(doctorsList.data.userPosition)) },
            { role: 'user', content: userService }
        ];
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        }) as LlmResponseDto;
        return response.choices[0].message.content;
    }

    async useWebRag(query: string) {
        return this.webSearchService.search(query);
    }

    async useDoctorAvailableSlots(doctorName: string, date?: string, appointmentType?: string): Promise<string> {
        return this.doctorSlotsService.getDoctorAvailableSlots(doctorName, date, appointmentType);
    }

    async checkIsContinueScnene(messages: ChatMsg[]) {
        const messagesForReq = messages.slice(0, 10);
        const messagesReq = [
            { role: 'system', content: checkingToExitFromScenePrompt },
            { role: 'user', content: JSON.stringify(messagesForReq) }
        ];
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        }) as LlmResponseDto;
        return response.choices[0].message.content === 'continue';
    }
}
