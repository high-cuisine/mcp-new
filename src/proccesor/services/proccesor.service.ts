import { Injectable, OnModuleInit } from "@nestjs/common";
import { systemPrompt } from "../constants/system.prompt";
import OpenAI from "openai";
import { ChatMsg } from "../interface/chat.interface";
import tools from "../tools/tools";
import { LlmResponseDto } from "../dto/llm-response.dto";
import { findServicePrompt } from "../constants/findService.prompt";
import { ServicesService } from "src/crm/services/services.service";
import { DoctorService } from "src/crm/services/doctor.service";
import { findDoctorPrompt } from "../constants/findDoctorPrompt.prompt";

@Injectable()
export class ProccesorService {

    private readonly openai: OpenAI;
    telegramService: any;
    constructor(
        private readonly servicesService: ServicesService,
        private readonly doctorService: DoctorService
    ) {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    

    async sendMessage(messages: ChatMsg[]) {
        // Валидация сообщений
        const validMessages = messages.filter(msg => msg.role && msg.content);
        
        if (validMessages.length === 0) {
            throw new Error('No valid messages provided');
        }
        
        const messagesReq = [{ role: 'system', content: systemPrompt }, ...validMessages];
        
        // Отладочная информация
        console.log('Final messages array:', JSON.stringify(messagesReq, null, 2));
        
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[],
            tool_choice: "auto"
        }) as LlmResponseDto;
        
        if(response.choices[0].message.tool_calls) {
            return { type: response.choices[0].message.tool_calls[0].function.name, content: ''}
        }

        return {type: 'text', content: response.choices[0].message.content};
    }

    async findDoctorAndServiceForAppointment(userService: string) {
        const servicesList = await this.servicesService.getServices();
        const messagesReq = [{ role: 'system', content: findServicePrompt.replace('{services_list}', servicesList.join('\n')) }, { role: 'user', content: userService }];

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            
        }) as LlmResponseDto;
        console.log(response.choices[0].message.content);
        return response.choices[0].message.content;
    }

    async findDoctorForAppointment(userService: string) {
        const doctorsList = await this.doctorService.getDoctors();
        const messagesReq = [{ role: 'system', content: findDoctorPrompt.replace('{doctors_list}', JSON.stringify(doctorsList.data.userPosition)) }, { role: 'user', content: userService }];
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        }) as LlmResponseDto;
        return response.choices[0].message.content;
    }
}
