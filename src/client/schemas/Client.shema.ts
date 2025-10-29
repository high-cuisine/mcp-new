import { Schema } from "@nestjs/mongoose";
import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
    user_id: { type: Number, index: true },
    telegram_id: { type: String, index: true, required: true },
    telegram_name: { type: String },
    telegram_number: { type: String, index: true },
    whatsapp_number: { type: String, index: true },
    crm_client_id: { type: Number, index: true },
    created_at: { type: Date, default: Date.now },
    messages: [
        {
            text: { type: String },
            role: { type: String },
            created_at: { type: Date, default: Date.now }
        }
    ]
});

ClientSchema.index({ user_id: 1, telegram_id: 1, whatsapp_number: 1, telegram_number: 1 });

ClientSchema.index({ messages: 1 });

export { ClientSchema };

/**
 * пользователь написал
 * мы получаем массив сообщений его
 * даем системный промпт
 * запрос к чату 
 * получаем ответ новый отправляем пользователя
 * 
 * 
 * настраиваем комманды для mcp 
 * управляем модулем базы, crm,
 */
