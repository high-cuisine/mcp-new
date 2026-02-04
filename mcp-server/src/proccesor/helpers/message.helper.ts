/** Сообщение пользователю при передаче модератору */
export const MODERATOR_MESSAGE = 'Модератор подключится к вам через пару минут и поможет с вашим вопросом.';

/** Обрезает текст до maxChars символов */
export function truncate(text: string | undefined, maxChars: number): string {
    if (!text) return '';
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** Ответы «не знаю», «не найден» и т.п. — передаём модератору, пользователю не показываем */
export function isNegativeResponse(text: string | undefined): boolean {
    if (!text || !String(text).trim()) return true;
    return /не найден|не найдена|не найдено|нет информации|не знаю|не могу сказать|нет такой информации|недоступн|не найден в системе|нет подходящей|нет данных|не могу помочь|нет доступных|записей не найдено/i.test(String(text));
}

/** Извлекает название услуги из запроса (убирает стоп-слова) */
export function extractServiceName(text: string): string {
    return text
        .replace(/\b(как|что|где|когда|можно|нужно|хочу|интересует|интересно|про|о|об|просто|только|еще|ещё|сколько|стоит|цена|стоимость|цены|на|для|у|с)\b/gi, '')
        .trim();
}

/** Текст для уведомления модератора: вопрос об услуге, бот не нашёл данных */
export function notifyModeratorServiceQuery(query: string): string {
    return `❗️ Пользователь задал конкретный вопрос об услуге, но бот не нашёл данных.\nЗапрос: ${query}`;
}

/** Формирует ответ «модератор подключится» + уведомление модератору */
export function buildModeratorResponse(notifyModerator: string): { type: 'text'; content: string; notifyModerator: string } {
    return {
        type: 'text',
        content: MODERATOR_MESSAGE,
        notifyModerator,
    };
}

/** Последнее сообщение из массива (content) */
export function getLastMessageContent(messages: Array<{ role?: string; content?: string }>): string {
    const last = messages.filter(m => m.role && m.content).slice(-1)[0];
    return last?.content ?? '';
}
