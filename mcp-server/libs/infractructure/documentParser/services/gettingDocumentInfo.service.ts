import { Injectable } from "@nestjs/common";
import { RedisService } from "@infra/redis/redis.service";

type TimetableDay = {
    date: string;
    items: string[];
    score?: number;
};

type RuleIndexItem = {
    code: string;
    title: string;
    [key: string]: unknown;
};

type IndexedRules<T> = {
    index: RuleIndexItem[];
    items: Record<string, T>;
};

@Injectable()
export class GettingDocumentInfoService {
    constructor(
        private readonly redisService: RedisService,
    ) {}

    /**
     * Получить расписание (zset "timetable").
     */
    async getTimetable(): Promise<TimetableDay[]> {
        const raw = await this.redisService.zrangeWithScores('timetable', 0, -1);
        const result: TimetableDay[] = [];

        // ioredis возвращает [member1, score1, member2, score2, ...]
        for (let i = 0; i < raw.length; i += 2) {
            const member = raw[i];
            const scoreStr = raw[i + 1];
            if (!member) continue;
            try {
                const parsed = JSON.parse(member) as { date: string; items: string[] };
                result.push({
                    date: parsed.date,
                    items: parsed.items,
                    score: Number(scoreStr),
                });
            } catch {
                // игнорируем битые записи
            }
        }

        return result;
    }

    /**
     * Получить список врачей (hash "doctors").
     */
    async getDoctors(): Promise<Array<{ lastName: string; details: string[] }>> {
        const raw = await this.redisService.hgetall('doctors');
        if (!raw) return [];

        const result: Array<{ lastName: string; details: string[] }> = [];
        for (const value of Object.values(raw)) {
            try {
                const parsed = JSON.parse(value);
                result.push(parsed);
            } catch {
                // пропускаем некорректные записи
            }
        }
        return result;
    }

    private async getIndexedRules<T>(indexKey: string, itemsKey: string): Promise<IndexedRules<T>> {
        const indexJson = await this.redisService.get(indexKey);
        const index: RuleIndexItem[] = indexJson ? JSON.parse(indexJson) as RuleIndexItem[] : [];

        const itemsRaw = await this.redisService.hgetall(itemsKey);
        const items: Record<string, T> = {};
        if (itemsRaw) {
            for (const [code, value] of Object.entries(itemsRaw)) {
                items[code] = JSON.parse(value) as T;
            }
        }

        return { index, items };
    }

    async getReceptionRules() {
        return this.getIndexedRules('rules:reception:index', 'rules:reception:items');
    }

    async getSurgeryRules() {
        return this.getIndexedRules('rules:surgery:index', 'rules:surgery:items');
    }

    async getDentistryRules() {
        return this.getIndexedRules('rules:dentistry:index', 'rules:dentistry:items');
    }

    async getCardiologyRules() {
        return this.getIndexedRules('rules:cardiology:index', 'rules:cardiology:items');
    }

    async getProceduresRules() {
        return this.getIndexedRules('rules:procedures:index', 'rules:procedures:items');
    }

    async getUltrasoundRules() {
        return this.getIndexedRules('rules:ultrasound:index', 'rules:ultrasound:items');
    }

    async getLaboratoryRules() {
        return this.getIndexedRules('rules:laboratory:index', 'rules:laboratory:items');
    }

    async getExternalClinicRules() {
        return this.getIndexedRules('rules:external:index', 'rules:external:items');
    }

    async getStationaryRules() {
        return this.getIndexedRules('rules:stationary:index', 'rules:stationary:items');
    }
}

