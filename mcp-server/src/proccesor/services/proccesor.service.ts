import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { systemPrompt } from "../constants/system.prompt";
import OpenAI from "openai";
import { ChatMsg } from "../interface/chat.interface";
import tools from "../tools/tools";
import toolsAppointmentSlots from "../tools/toolsAppointmentSlots";
import { LlmResponseDto } from "../dto/llm-response.dto";
import { findServicePrompt } from "../constants/helpingPrompts/findService.prompt";
import { ServicesService } from "src/crm/services/services.service";
import { DoctorService } from "src/crm/services/doctor.service";
import { findDoctorPrompt } from "../constants/helpingPrompts/findDoctorPrompt.prompt";
import { WebRagService } from "@infra/rag/service/web-rag.service";
import { ChromRagService } from "@infra/rag/service/chrom-rag.service";
import { helpPrompt } from "../constants/help.prompt";
import { ClinicRulesJson } from "../interface/clinic-rules-json.interface";
import { ClinicRules, ClinicRulesDocument } from "../schemas/clinic-rules.schema";
import { wordPrompt } from "../constants/helpingPrompts/word.prompt";
import { RedisService } from "@infra/redis/redis.service";
import { checkingToExitFromScenePrompt } from "../constants/technicalPrompt/checkingToExitFromScene.prompt";
import { ClientRepository } from "src/client/repositorys/client.repository";

@Injectable()
export class ProccesorService {

    private readonly openai: OpenAI;
    telegramService: any;

    private truncate(text: string, maxChars: number): string {
        if (!text) return "";
        return text.length > maxChars ? text.slice(0, maxChars) : text;
    }

    async getLatestClinicRules(): Promise<ClinicRulesJson | null> {
        if (!this.clinicRulesModel) return null;
        const doc = await this.clinicRulesModel.findOne().sort({ createdAt: -1 }).lean();
        return (doc as any)?.content || null;
    }

    async parseClinicRules(rawText: string, meta?: { fileName?: string; mimeType?: string }): Promise<ClinicRulesJson> {
        const text = this.truncate(rawText, 20000);

        const system = wordPrompt;

        const messagesReq = [
            { role: 'system', content: system },
            { role: 'user', content: text },
        ];

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            max_tokens: 2000,
            temperature: 0.2,
        }) as LlmResponseDto;

        const content = response.choices[0].message.content;
        let parsed: ClinicRulesJson;
        try {
            parsed = JSON.parse(content || "{}");
        } catch (e) {
            throw new Error(`Failed to parse clinic rules JSON: ${e}`);
        }

        await this.saveClinicRules(parsed, text, meta);
        return parsed;
    }

    private async saveClinicRules(parsed: ClinicRulesJson, rawText: string, meta?: { fileName?: string; mimeType?: string }) {
        if (!this.clinicRulesModel) return;
        await this.clinicRulesModel.create({
            content: parsed,
            rawText,
            fileName: meta?.fileName,
            mimeType: meta?.mimeType,
        });
    }
    constructor(
        private readonly servicesService: ServicesService,
        private readonly doctorService: DoctorService,
        private readonly webRagService: WebRagService,
        private readonly chromRagService: ChromRagService,
        private readonly redisService: RedisService,
        private readonly clientRepository: ClientRepository,
        @InjectModel(ClinicRules.name) private readonly clinicRulesModel: Model<ClinicRulesDocument>,
    ) {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

    }

    async sendMessage(messages: ChatMsg[], telegramId?: string) {
        // Валидация сообщений
        const validMessages = messages.filter(msg => msg.role && msg.content).slice(-8);
        
        if (validMessages.length === 0) {
            throw new Error('No valid messages provided');
        }
        
        // Проверяем намерения в правильном порядке (сначала специфичные действия)
        const lastMessage = validMessages[validMessages.length - 1]?.content || '';
        const priceIntent = /цена|стоим|сколько стоит|прайс|руб|₽/i.test(lastMessage);
        
        // Проверяем намерение переноса записи
        const hasMoveIntent = /перенести|перенести.*запис|перенести.*прием|изменить.*время|изменить.*дату|перенести.*на.*другое/i.test(lastMessage);
        if (hasMoveIntent) {
            return { type: 'move_appointment', content: '' };
        }
        
        // Проверяем намерение отмены записи
        const hasCancelIntent = /отменить.*запис|отменить.*прием|удалить.*запис|отменить.*мой.*прием/i.test(lastMessage);
        if (hasCancelIntent) {
            return { type: 'cancel_appointment', content: '' };
        }
        
        // Проверяем намерение просмотра записей
        const hasShowIntent = /какие.*прием|мои.*запис|покажи.*прием|покажи.*запис|посмотреть.*запис|расписание.*прием/i.test(lastMessage);
        if (hasShowIntent) {
            return { type: 'show_appointment', content: '' };
        }
        
        // Проверяем намерение создания записи (только если нет других намерений)
        const hasAppointmentIntent = /записаться|записать|запись|запиши|хочу.*прием|нужно.*прием|планирую.*визит|хочу.*к.*врач|нужно.*к.*врач|давайте.*запишемся/i.test(lastMessage);
        if (hasAppointmentIntent) {
            return { type: 'create_appointment', content: '' };
        }
        
        // Проверяем, является ли последнее сообщение вопросом об услуге (но не записью)
        const isServiceQuery = /стрижк|груминг|вакцинац|прививк|кастрац|стерилиз|узи|рентген|анализ|прием|чистк|чипирован|паспорт|операц|хирург|манипуляц/i.test(lastMessage);
        const notifyModeratorText = (query: string) =>
            `❗️ Пользователь задал конкретный вопрос об услуге, но бот не нашёл данных.\n` +
            `Запрос: ${query}`;
        
        const messagesReq = [{ role: 'system', content: systemPrompt }, ...validMessages];
        
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            tools: [...tools, ...toolsAppointmentSlots] as OpenAI.Chat.Completions.ChatCompletionTool[],
            tool_choice: "auto"
        }) as LlmResponseDto;

        // Если это вопрос об услуге с запросом цены, но модель не вызвала search_service_price, вызываем его автоматически
        // НО только если нет намерения записи
        if (isServiceQuery && priceIntent && !hasAppointmentIntent && (!response.choices[0].message.tool_calls || 
            !response.choices[0].message.tool_calls.some(tc => tc.function.name === 'search_service_price'))) {
            // Извлекаем название услуги из запроса
            let serviceName = lastMessage;
            // Убираем лишние слова
            serviceName = serviceName.replace(/\b(как|что|где|когда|можно|нужно|хочу|интересует|интересно|про|о|об|просто|только|еще|ещё|сколько|стоит|цена|стоимость|цены|на|для|у|с)\b/gi, '').trim();
            
            const priceResult = await this.usePriceSearch(serviceName);
            if (priceResult && !/не найдена|не найдено|нет информации/i.test(priceResult)) {
                return { type: 'text', content: priceResult };
            }

            return {
                type: 'text',
                content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                notifyModerator: notifyModeratorText(lastMessage),
            };
        }

        

        if(response.choices[0].message.tool_calls) {
            const toolCall = response.choices[0].message.tool_calls[0];
            const functionName = toolCall.function.name;
            
            // Если модель вызвала create_appointment, сразу возвращаем тип для сцены
            if (functionName === 'create_appointment') {
                return { type: 'create_appointment', content: '' };
            }
            
            // Если модель вызвала move_appointment, возвращаем тип для сцены переноса
            if (functionName === 'move_appointment') {
                return { type: 'move_appointment', content: '' };
            }
            
            // Если модель вызвала cancel_appointment, возвращаем тип для сцены отмены
            if (functionName === 'cancel_appointment') {
                return { type: 'cancel_appointment', content: '' };
            }
            
            // Если модель вызвала show_appointment, возвращаем тип для сцены показа
            if (functionName === 'show_appointment') {
                return { type: 'show_appointment', content: '' };
            }
            
            if (functionName === 'search_web') {
                const args = JSON.parse(toolCall.function.arguments);
                const query = args.query;
                // Вместо веб-рага отправляем запрос модератору
                return {
                    type: 'text',
                    content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                    notifyModerator: `❗️ Пользователь задал вопрос, требующий помощи модератора.\nЗапрос: ${query}`
                };
            }
            
            if (functionName === 'search_knowledge_base') {
                const args = JSON.parse(toolCall.function.arguments);
                const query = args.query;
                let knowledgeResult: string;
                try {
                    knowledgeResult = await this.useKnowledgeBase(query);
                } catch (error) {
                    // Если не найдено в базе знаний, отправляем запрос модератору
                    return {
                        type: 'text',
                        content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                        notifyModerator: `❗️ Пользователь задал вопрос, требующий помощи модератора.\nЗапрос: ${query}`
                    };
                }
                
                // Если вопрос об услугах, также ищем цены на эту услугу
                // Определяем, является ли запрос вопросом об услуге
                const isServiceQuery = /стрижк|груминг|вакцинац|прививк|кастрац|стерилиз|узи|рентген|анализ|прием|чистк|чипирован|паспорт|операц|хирург/i.test(query);
                const priceIntentByQuery = /цена|стоим|сколько стоит|прайс|руб|₽/i.test(query);
                
                if (isServiceQuery && priceIntentByQuery) {
                    // Извлекаем название услуги из запроса
                    let serviceName = query;
                    // Убираем лишние слова
                    serviceName = serviceName.replace(/\b(как|что|где|когда|можно|нужно|хочу|интересует|интересно|про|о|об|просто|только|еще|ещё)\b/gi, '').trim();
                    
                    // Ищем цену на эту услугу
                    const priceResult = await this.usePriceSearch(serviceName);
                    if (priceResult && !/не найдена|не найдено|нет информации/i.test(priceResult)) {
                        return { type: 'text', content: priceResult };
                    }
                    
                    // Если не найдена цена на конкретную услугу, ищем цены на основные услуги
                    const mainServices = ['вакцинация', 'груминг', 'прием врача', 'УЗИ', 'рентген', 'анализ крови'];
                    let priceInfo = '\n\n**Цены на основные услуги:**\n';
                    let foundPrices = false;
                    
                    for (const service of mainServices) {
                        const priceResult = await this.chromRagService.searchForPrice(service, 3, 1.4);
                        if (priceResult && priceResult.type === 'exact') {
                            priceInfo += `• ${priceResult.service_name}: ${priceResult.price_str}\n`;
                            foundPrices = true;
                        } else if (priceResult && priceResult.type === 'range') {
                            priceInfo += `• ${service}: ${priceResult.price_str}\n`;
                            foundPrices = true;
                        }
                    }
                    
                    if (foundPrices) {
                        return { type: 'text', content: knowledgeResult + priceInfo };
                    }

                    return {
                        type: 'text',
                        content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                        notifyModerator: notifyModeratorText(lastMessage || query),
                    };
                }
                
                if (isServiceQuery && !priceIntentByQuery) {
                    return {
                        type: 'text',
                        content: knowledgeResult,
                        notifyModerator: notifyModeratorText(lastMessage || query),
                    };
                }

                return { type: 'text', content: knowledgeResult };
            }
            
            if (functionName === 'search_service_price') {
                const args = JSON.parse(toolCall.function.arguments);
                const serviceName = args.service_name;
                const serviceHasPriceIntent = priceIntent || /цена|стоим|сколько стоит|прайс|руб|₽/i.test(serviceName || '');
                
                if (!serviceHasPriceIntent) {
                    try {
                        const knowledgeResult = await this.useKnowledgeBase(serviceName || lastMessage || '');
                        return { type: 'text', content: knowledgeResult };
                    } catch (error) {
                        // Если не найдено в базе знаний, отправляем запрос модератору
                        return {
                            type: 'text',
                            content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                            notifyModerator: `❗️ Пользователь задал вопрос, требующий помощи модератора.\nЗапрос: ${serviceName || lastMessage || ''}`
                        };
                    }
                }

                const priceResult = await this.usePriceSearch(serviceName);
                if (priceResult && !/не найдена|не найдено|нет информации/i.test(priceResult)) {
                    return { type: 'text', content: priceResult };
                }

                return {
                    type: 'text',
                    content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                    notifyModerator: notifyModeratorText(lastMessage || serviceName),
                };
            }
            
            if (functionName === 'get_doctor_available_slots') {
                const args = JSON.parse(toolCall.function.arguments);
                const doctorName = args.doctor_name;
                const date = args.date;
                
                const slotsResult = await this.useDoctorAvailableSlots(doctorName, date);
                return { type: 'text', content: slotsResult };
            }
            
            if (functionName === 'get_appointment_slots') {
                const args = JSON.parse(toolCall.function.arguments);
                const doctorLastName = args.doctor_last_name;
                const date = args.date;
                const appointmentType = args.appointment_type;
                
                const slotsResult = await this.useDoctorAvailableSlots(doctorLastName, date, appointmentType);
                return { type: 'text', content: slotsResult };
            }
            
            if (functionName === 'call_moderator') {
                const args = JSON.parse(toolCall.function.arguments);
                const reason = args.reason || 'Клиент запросил помощь модератора';
                
                // Получаем последнее сообщение пользователя
                const lastUserMessage = validMessages.filter(msg => msg.role === 'user').pop()?.content || '';
                
                // Получаем информацию о клиенте, если передан telegramId
                let clientInfo = '';
                if (telegramId) {
                    try {
                        const client = await this.clientRepository.findByTelegramId(telegramId);
                        if (client) {
                            const clientObj = client.toObject ? client.toObject() : (client as any);
                            clientInfo = `\n\n📋 Информация о клиенте:\n`;
                            clientInfo += `• Telegram ID: ${telegramId}\n`;
                            if (clientObj.telegram_name) {
                                clientInfo += `• Имя: ${clientObj.telegram_name}\n`;
                            }
                            if (clientObj.telegram_number) {
                                clientInfo += `• Телефон: ${clientObj.telegram_number}\n`;
                            }
                            if (clientObj.whatsapp_number) {
                                clientInfo += `• WhatsApp: ${clientObj.whatsapp_number}\n`;
                            }
                            if (clientObj.crm_client_id) {
                                clientInfo += `• CRM ID: ${clientObj.crm_client_id}\n`;
                            }
                        }
                    } catch (error) {
                        console.error('Ошибка при получении информации о клиенте:', error);
                    }
                }
                
                const moderatorMessage = `🔔 ВЫЗОВ МОДЕРАТОРА\n\nПричина: ${reason}${lastUserMessage ? `\n\nПоследнее сообщение клиента: "${lastUserMessage}"` : ''}${clientInfo}`;
                
                return {
                    type: 'text',
                    content: 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.',
                    notifyModerator: moderatorMessage
                };
            }
            
            return { type: functionName, content: ''}
        }

        if (isServiceQuery && !priceIntent) {
            return {
                type: 'text',
                content: response.choices[0].message.content,
                notifyModerator: notifyModeratorText(lastMessage),
            };
        }

        return {
            type: 'text',
            content: response.choices[0].message.content,
            notifyModerator: /буланов|буланова|расписан|график|когда начинает|во сколько|работает/i.test(lastMessage || '')
              ? notifyModeratorText(lastMessage)
              : undefined,
        };
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

    async useWebRag(query:string) {
        const info = await this.webRagService.search(query);
        
        const webInfoText = Array.isArray(info) ? info.join('\n\n') : JSON.stringify(info);
        const prompt = helpPrompt
            .replace('{web_info}', webInfoText)
            .replace('{client_query}', query);

        const messagesReq = [{ role: 'system', content: prompt }, { role: 'user', content: query }];

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            
        }) as LlmResponseDto;
        
        return response.choices[0].message.content;
    }

    async useKnowledgeBase(query: string) {
        const result = await this.chromRagService.search(query);
        
        if (!result) {
            // Вместо веб-рага отправляем запрос модератору
            // Возвращаем специальный объект, который будет обработан в sendMessage
            throw new Error('KNOWLEDGE_BASE_NOT_FOUND');
        }
        
        return result.answer;
    }

    async usePriceSearch(serviceName: string) {
        const result = await this.chromRagService.searchForPrice(serviceName);
        
        if (!result) {
            // Если не найдено в базе цен, возвращаем сообщение для уведомления модератора
            return `Информация о ценах на "${serviceName}" не найдена.`;
        }

        // Форматируем ответ в зависимости от типа результата
        if (result.type === 'exact') {
            return `Стоимость услуги "${result.service_name}" (${result.category}): ${result.price_str}`;
        } else if (result.type === 'range') {
            // Если найдено несколько вариантов, но они все из одной категории и цена одинаковая
            const uniqueCategories = [...new Set(result.services.map((s: any) => s.category))];
            const uniquePrices = [...new Set(result.services.map((s: any) => s.price))];
            
            if (uniqueCategories.length === 1 && uniquePrices.length === 1) {
                // Все результаты одинаковые - возвращаем точную цену
                return `Стоимость услуги "${result.services[0].name}" (${result.services[0].category}): ${uniquePrices[0]} руб`;
            }
            
            let response = `Найдено несколько вариантов услуги "${serviceName}":\n\n`;
            response += `Диапазон цен: ${result.price_str}\n\n`;
            response += `Варианты:\n`;
            result.services.forEach((service: any) => {
                response += `• ${service.name} (${service.category}): ${service.price} руб\n`;
            });
            return response;
        }

        return `Информация о ценах на "${serviceName}" не найдена. Могу помочь вам записаться на прием для уточнения стоимости.`;
    }

    async useDoctorAvailableSlots(doctorName: string, date?: string, appointmentType?: string): Promise<string> {
        try {
            // Получаем правила из Redis (опционально)
            let rules: any = null;
            const rulesJson = await this.redisService.get('rules');
            if (rulesJson) {
                rules = JSON.parse(rulesJson);
                console.log('[useDoctorAvailableSlots] Правила загружены из Redis');
            } else {
                console.log('[useDoctorAvailableSlots] Правила не найдены в Redis - используем дефолтные слоты');
            }
            
            if (rules) {
                console.log('[useDoctorAvailableSlots] Структура правил:', {
                    hasDoctors: !!rules.doctors,
                    doctorsCount: rules.doctors?.length || 0,
                    doctorsList: rules.doctors?.map((d: any) => ({ lastName: d.lastName, name: d.name })) || [],
                    hasSchedule: !!rules.schedule,
                    scheduleType: Array.isArray(rules.schedule) ? 'array' : typeof rules.schedule,
                    scheduleKeys: Array.isArray(rules.schedule) ? rules.schedule.map((s: any) => s.date) : Object.keys(rules.schedule || {}),
                    period: rules.period
                });
            }
            
            // Извлекаем фамилию врача (берем первое слово, так как это фамилия)
            const nameParts = doctorName.trim().split(/\s+/);
            const doctorLastName = nameParts[0] || doctorName; // Фамилия - первое слово
            console.log('[useDoctorAvailableSlots] Ищем врача:', { doctorName, doctorLastName, nameParts });
            
            // Находим врача в правилах (если правила есть)
            let doctor: any = null;
            if (rules?.doctors) {
                doctor = rules.doctors.find((d: any) => {
                    // Проверяем lastName
                    if (d.lastName) {
                        const ruleLastName = d.lastName.toLowerCase().trim();
                        if (ruleLastName === doctorLastName.toLowerCase() || 
                            ruleLastName.includes(doctorLastName.toLowerCase()) ||
                            doctorLastName.toLowerCase().includes(ruleLastName)) {
                            console.log('[useDoctorAvailableSlots] Найден врач по lastName:', d);
                            return true;
                        }
                    }
                    // Проверяем name (может содержать фамилию)
                    if (d.name) {
                        const ruleName = d.name.toLowerCase().trim();
                        const nameParts = ruleName.split(/\s+/);
                        const ruleLastName = nameParts[0] || ruleName;
                        if (ruleLastName === doctorLastName.toLowerCase() ||
                            ruleName.includes(doctorLastName.toLowerCase()) ||
                            doctorLastName.toLowerCase().includes(ruleLastName)) {
                            console.log('[useDoctorAvailableSlots] Найден врач по name:', d);
                            return true;
                        }
                    }
                    return false;
                });
            }

            // Получаем всех врачей из CRM для поиска ID
            const allDoctors = await this.doctorService.getDoctorsWithAppointment();
            const doctorFromCrm = allDoctors.find((d: any) => {
                const dLastName = (d.last_name || d.full_name || '').toLowerCase();
                return dLastName.includes(doctorLastName.toLowerCase());
            });

            if (!doctorFromCrm) {
                return `Врач "${doctorName}" не найден в системе.`;
            }

            // Получаем существующие записи врача
            const existingAppointments = await this.doctorService.getDoctorsTimeToAppointment(doctorFromCrm.id);
            
            // Преобразуем записи в формат дата-время для фильтрации
            const occupiedSlots = new Set<string>();
            existingAppointments.forEach((appointmentDate: string) => {
                const date = new Date(appointmentDate);
                const dateStr = date.toISOString().split('T')[0];
                const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                occupiedSlots.add(`${dateStr} ${timeStr}`);
            });

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Определяем период для генерации слотов
            let startDate: Date;
            let endDate: Date;
            
            if (date) {
                // Если указана конкретная дата - работаем только с ней
                startDate = new Date(date + 'T00:00:00');
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(date + 'T23:59:59');
                endDate.setHours(23, 59, 59, 999);
            } else if (rules?.period?.start && rules?.period?.end) {
                // Если есть период в правилах - используем его
                startDate = new Date(rules.period.start + 'T00:00:00');
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(rules.period.end + 'T23:59:59');
                endDate.setHours(23, 59, 59, 999);
            } else {
                // Дефолт: сегодня + 14 дней
                startDate = new Date(today);
                endDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
                endDate.setHours(23, 59, 59, 999);
            }
            
            console.log('[useDoctorAvailableSlots] Период для генерации слотов:', {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                today: today.toISOString(),
                hasRules: !!rules
            });

            // Формируем доступные окна
            const availableSlots: Array<{ date: string; time: string; type: string }> = [];
            
            // Определяем длительность приема (из правил или дефолт)
            const appointmentDuration = appointmentType === 'primary' 
                ? (doctor?.appointmentTypes?.primary || doctor?.duration?.primary || 60)
                : appointmentType === 'follow_up'
                ? (doctor?.appointmentTypes?.follow_up || doctor?.duration?.repeat || 30)
                : appointmentType === 'ultrasound'
                ? (doctor?.appointmentTypes?.ultrasound || doctor?.duration?.ultrasound || 30)
                : appointmentType === 'analyses'
                ? (doctor?.appointmentTypes?.analyses || doctor?.duration?.analyses || 15)
                : appointmentType === 'xray'
                ? (doctor?.appointmentTypes?.xray || doctor?.duration?.xray || 30)
                : (doctor?.appointmentTypes?.primary || doctor?.duration?.primary || 60);
            
            // Если есть правила и расписание - проверяем ограничения
            if (rules?.schedule) {
                // Обрабатываем как объект (ключ - дата) или как массив
                const scheduleEntries = Array.isArray(rules.schedule) 
                    ? rules.schedule.map((item: any) => [item.date, item])
                    : Object.entries(rules.schedule);
                
                console.log('[useDoctorAvailableSlots] Обрабатываем расписание:', {
                    entriesCount: scheduleEntries.length,
                    firstEntry: scheduleEntries[0]
                });
                
                // Обрабатываем расписание из правил - применяем ограничения
                for (const [scheduleDate, daySchedule] of scheduleEntries) {
                    const dayScheduleObj = daySchedule as any;
                    const scheduleDateObj = new Date(scheduleDate + 'T00:00:00');
                    scheduleDateObj.setHours(0, 0, 0, 0);
                    
                    // Фильтрация по дате
                    if (date && scheduleDate !== date) continue;
                    if (scheduleDateObj < today) continue;
                    if (scheduleDateObj < startDate || scheduleDateObj > endDate) continue;
                    
                    // Проверяем ограничения из правил
                    const doctorAppointments = dayScheduleObj.doctorAppointments || dayScheduleObj.reception || [];
                    const procedureProviders = dayScheduleObj.procedureProviders || dayScheduleObj.procedures || [];
                    const walkInOnly = dayScheduleObj.walkInOnly || dayScheduleObj.liveQueue || false;
                    
                    const isDoctorWorking = doctorAppointments.some((name: string) => {
                        const nameLower = name.toLowerCase().trim();
                        const nameParts = nameLower.split(/\s+/);
                        const scheduleLastName = nameParts[0] || nameLower;
                        return scheduleLastName === doctorLastName.toLowerCase() ||
                               nameLower.includes(doctorLastName.toLowerCase());
                    });
                    
                    const isProcedureProvider = procedureProviders.some((name: string) => {
                        const nameLower = name.toLowerCase().trim();
                        const nameParts = nameLower.split(/\s+/);
                        const providerLastName = nameParts[0] || nameLower;
                        return providerLastName === doctorLastName.toLowerCase() ||
                               nameLower.includes(doctorLastName.toLowerCase());
                    });
                    
                    // Если правила ограничивают - применяем ограничения
                    if (isProcedureProvider && !isDoctorWorking) {
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: врач только фельдшер - пропускаем`);
                        continue;
                    }
                    
                    if (walkInOnly) {
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: только живая очередь - пропускаем`);
                        continue;
                    }
                    
                    if (!isDoctorWorking) {
                        // Врач не указан в расписании на эту дату - пропускаем (правила ограничивают)
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: врач не указан в расписании - пропускаем`);
                        continue;
                    }
                    
                    // Врач работает - генерируем слоты с учетом правил
                    const clinicOpensAt = dayScheduleObj.clinicOpensAt || '09:00';
                    const specialTags = dayScheduleObj.specialTags || [];
                    const isSurgeryDay = dayScheduleObj.surgeryDay || specialTags.includes('surgery_day');
                    const isDentalDay = dayScheduleObj.dentistryDay || specialTags.includes('dental_day');
                    const isCardiologyDay = dayScheduleObj.cardiologyDay || specialTags.includes('cardiology_day');
                    
                    let timeSlots: string[] = [];

                    if (isSurgeryDay && rules.businessRules?.surgery_day?.surgeon?.toLowerCase() === doctorLastName.toLowerCase()) {
                        timeSlots = rules.businessRules.surgery_day.fixedConsultSlots || rules.businessRules.surgery_day.slots || [];
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: хирургический день, слотов: ${timeSlots.length}`);
                    } else if (isDentalDay && rules.businessRules?.dental_day?.dentist?.toLowerCase() === doctorLastName.toLowerCase()) {
                        timeSlots = rules.businessRules.dental_day.fixedSlots || rules.businessRules.dental_day.slots || [];
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: стоматологический день, слотов: ${timeSlots.length}`);
                    } else if (isCardiologyDay && rules.businessRules?.cardiology_day?.cardiologist?.toLowerCase() === doctorLastName.toLowerCase()) {
                        const startTime = rules.businessRules.cardiology_day.startTime || '10:00';
                        const endTime = rules.businessRules.cardiology_day.endTime || '20:00';
                        timeSlots = this.generateTimeSlots(startTime, endTime, 60);
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: кардиологический день, слотов: ${timeSlots.length}`);
                    } else {
                        // Обычный день - используем длительность из правил или дефолт
                        timeSlots = this.generateTimeSlots(clinicOpensAt, '18:00', appointmentDuration);
                        console.log(`[useDoctorAvailableSlots] ${scheduleDate}: обычный день, слотов: ${timeSlots.length}, длительность: ${appointmentDuration} мин`);
                    }

                    // Фильтруем занятые слоты
                    timeSlots.forEach((timeSlot) => {
                        const slotKey = `${scheduleDate} ${timeSlot}`;
                        if (!occupiedSlots.has(slotKey)) {
                            availableSlots.push({
                                date: scheduleDate,
                                time: timeSlot,
                                type: appointmentType || 'primary'
                            });
                        }
                    });
                }
            } else {
                // Правил нет или расписание отсутствует - генерируем ВСЕ свободные окна
                console.log('[useDoctorAvailableSlots] Правила не ограничивают - генерируем все свободные окна');
                
                // Генерируем слоты для каждого дня в периоде
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const currentDate = new Date(d);
                    currentDate.setHours(0, 0, 0, 0);
                    
                    if (currentDate < today) continue;
                    
                    const dateStr = currentDate.toISOString().split('T')[0];
                    
                    // Генерируем стандартные слоты (09:00 - 18:00)
                    const timeSlots = this.generateTimeSlots('09:00', '18:00', appointmentDuration);
                    
                    // Фильтруем занятые слоты
                    timeSlots.forEach((timeSlot) => {
                        const slotKey = `${dateStr} ${timeSlot}`;
                        if (!occupiedSlots.has(slotKey)) {
                            availableSlots.push({
                                date: dateStr,
                                time: timeSlot,
                                type: appointmentType || 'primary'
                            });
                        }
                    });
                }
            }

            console.log(`[useDoctorAvailableSlots] Итого доступных окон: ${availableSlots.length}`);
            
            if (availableSlots.length === 0) {
                console.log(`[useDoctorAvailableSlots] Нет доступных окон. Диагностика:`, {
                    hasRules: !!rules,
                    hasSchedule: !!rules?.schedule,
                    doctorFound: !!doctor,
                    occupiedSlotsCount: occupiedSlots.size,
                    period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
                });
                
                if (!rules || !rules.schedule) {
                    // Правил нет - значит все слоты заняты
                    return `К сожалению, у врача ${doctorName} нет доступных окон для записи${date ? ` на ${date}` : ''}. Все слоты заняты.`;
                }
                
                // Правила есть - проверяем, указан ли врач в расписании
                const scheduleEntries = Array.isArray(rules.schedule) 
                    ? rules.schedule.map((item: any) => [item.date, item])
                    : Object.entries(rules.schedule);
                
                const datesWithDoctor = scheduleEntries
                    .filter(([scheduleDate, daySchedule]: [string, any]) => {
                        const doctorAppointments = daySchedule.doctorAppointments || daySchedule.reception || [];
                        return doctorAppointments.some((name: string) => {
                            const nameLower = name.toLowerCase().trim();
                            const nameParts = nameLower.split(/\s+/);
                            const scheduleLastName = nameParts[0] || nameLower;
                            return scheduleLastName === doctorLastName.toLowerCase() ||
                                   nameLower.includes(doctorLastName.toLowerCase());
                        });
                    })
                    .map(([date]) => date);
                
                if (datesWithDoctor.length === 0) {
                    return `Врач "${doctorName}" не указан в расписании ни на одну дату. Возможно, он работает только по живой очереди или не ведет прием по записи.`;
                }
                
                return `К сожалению, у врача ${doctorName} нет доступных окон для записи${date ? ` на ${date}` : ''}. Врач указан в расписании на даты: ${datesWithDoctor.join(', ')}, но все слоты заняты.`;
            }

            // Группируем по датам
            const slotsByDate: Record<string, string[]> = {};
            availableSlots.forEach(slot => {
                if (!slotsByDate[slot.date]) {
                    slotsByDate[slot.date] = [];
                }
                slotsByDate[slot.date].push(slot.time);
            });

            // Формируем ответ
            let response = `Доступные окна для записи к врачу ${doctorName}:\n\n`;
            
            Object.entries(slotsByDate).sort().forEach(([date, times]) => {
                const dateObj = new Date(date);
                const dateStr = dateObj.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
                response += `📅 ${dateStr} (${date}):\n`;
                times.sort().forEach(time => {
                    response += `   • ${time}\n`;
                });
                response += '\n';
            });

            return response;
        } catch (error) {
            console.error('Ошибка при получении доступных окон врача:', error);
            return `Произошла ошибка при получении доступных окон. Попробуйте позже.`;
        }
    }

    private generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
        const slots: string[] = [];
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        
        const start = new Date();
        start.setHours(startHour, startMinute, 0, 0);
        
        const end = new Date();
        end.setHours(endHour, endMinute, 0, 0);
        
        let current = new Date(start);
        while (current < end) {
            const hours = String(current.getHours()).padStart(2, '0');
            const minutes = String(current.getMinutes()).padStart(2, '0');
            slots.push(`${hours}:${minutes}`);
            
            current = new Date(current.getTime() + durationMinutes * 60 * 1000);
        }
        
        return slots;
    }

    async checkIsContinueScnene(messages: ChatMsg[]) {
        const messagesForReq = messages.slice(0, 10);

        const messagesReq = [{ role: 'system', content: checkingToExitFromScenePrompt }, { role: 'user', content: JSON.stringify(messagesForReq) }];

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesReq as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            
        }) as LlmResponseDto;
        
        return response.choices[0].message.content === 'continue';
    }
}
