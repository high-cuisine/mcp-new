import { Model } from "mongoose";
import { ClientSchema } from "../schemas/Client.shema"; 
import { InjectModel } from "@nestjs/mongoose";

export class ClientRepository {
    constructor(
        @InjectModel('User') private readonly userModel: Model<typeof ClientSchema>
    ) {}
    async createUser(telegramId: string, telegramName: string, telegramNumber: string, whatsappNumber: string, createdAt: Date) {

     
        

        try {
            const newUser = await this.userModel.create({
                telegram_id: telegramId,
                telegram_name: telegramName,
                telegram_number: telegramNumber,
                whatsapp_number: whatsappNumber,
                created_at: createdAt,
                messages: []
            });
            return newUser;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async getUserById(id: string) {
        const user = await this.userModel.findById(id);
        return user;
    }

    async getUserByTelegramId(telegramId: string) {
        const user = await this.userModel.findOne({ telegram_id: telegramId });
        return user;
    }

    async addMessage(userId: string, message: { text: string, role: string }[]) {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        await this.userModel.findByIdAndUpdate(
            userId,
            { $push: { messages: { $each: message.map(m => ({ text: m.text, role: m.role, created_at: new Date() })) } } },
            { new: true }
        );
        const updatedUser = await this.userModel.findById(userId);
        return updatedUser;
    }

    async findByTelegramId(telegramId: string) {
        try {
            const user = await this.userModel.findOne({ telegram_id: telegramId });
            return user;
        } catch (error) {
            console.error('Error finding user by telegram ID:', error);
            return null;
        }
    }

    async updateCrmClientId(telegramId: string, crmClientId: number) {
        try {
            const user = await this.userModel.findOneAndUpdate(
                { telegram_id: telegramId },
                { $set: { crm_client_id: crmClientId } },
                { new: true }
            );
            return user;
        } catch (error) {
            console.error('Error updating crm_client_id:', error);
            throw error;
        }
    }

    async findByPhone(phone: string) {
        try {
            // Нормализуем телефон для поиска
            const normalizedPhone = this.normalizePhone(phone);
            
            // Ищем по whatsapp_number или telegram_number
            const user = await this.userModel.findOne({
                $or: [
                    { whatsapp_number: normalizedPhone },
                    { telegram_number: normalizedPhone },
                    { whatsapp_number: phone },
                    { telegram_number: phone }
                ]
            });
            return user;
        } catch (error) {
            console.error('Error finding user by phone:', error);
            return null;
        }
    }

    private normalizePhone(phone: string): string {
        if (!phone) return phone;
        
        // Удаляем все нецифровые символы кроме +
        let normalized = phone.replace(/[^\d+]/g, '');
        
        // Если начинается с 8, заменяем на +7
        if (normalized.startsWith('8')) {
            normalized = '+7' + normalized.substring(1);
        }
        
        // Если начинается с 7 без +, добавляем +
        if (normalized.startsWith('7') && !normalized.startsWith('+7')) {
            normalized = '+' + normalized;
        }
        
        // Если не начинается с +, добавляем +7
        if (!normalized.startsWith('+')) {
            normalized = '+7' + normalized;
        }
        
        return normalized;
    }
}