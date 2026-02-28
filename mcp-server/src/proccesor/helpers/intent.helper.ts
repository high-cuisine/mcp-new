/** Результат определения намерения по последнему сообщению */
export type IntentType = 'move_appointment' | 'cancel_appointment' | 'show_appointment' | 'create_appointment' | null;

/** Определяет намерение пользователя по тексту (без вызова LLM) */
export function detectQuickIntent(lastMessage: string): IntentType {
    const msg = lastMessage || '';
    if (/перенести|перенести.*запис|перенести.*прием|изменить.*время|изменить.*дату|перенести.*на.*другое/i.test(msg)) {
        return 'move_appointment';
    }
    if (/отменить.*запис|отменить.*прием|удалить.*запис|отменить.*мой.*прием/i.test(msg)) {
        return 'cancel_appointment';
    }
    if (/какие.*прием|мои.*запис|покажи.*прием|покажи.*запис|посмотреть.*запис|расписание.*прием/i.test(msg)) {
        return 'show_appointment';
    }
    if (/записаться|записать|запись|запиши|хочу.*прием|нужно.*прием|планирую.*визит|хочу.*к.*врач|нужно.*к.*врач|давайте.*запишемся/i.test(msg)) {
        return 'create_appointment';
    }
    return null;
}

/** Есть ли в сообщении запрос цены */
export function hasPriceIntent(text: string): boolean {
    return /цена|стоим|сколько стоит|прайс|руб|₽/i.test(text || '');
}

/** Является ли сообщение вопросом об услуге (стрижка, груминг, приём и т.д.) */
export function isServiceQuery(text: string): boolean {
    return /стрижк|груминг|вакцинац|прививк|кастрац|стерилиз|узи|рентген|анализ|прием|чистк|чипирован|паспорт|операц|хирург|манипуляц/i.test(text || '');
}

/** Вопрос о наличии чего-то в клинике (услуги, возможность, оборудование и т.д.) — ищем в RAG с широкой выборкой */
export function isAvailabilityQuery(text: string): boolean {
    const msg = (text || '').toLowerCase();
    if (msg.length < 5) return false;
    return (
        /есть\s+ли\s+(у\s+вас|в\s+клинике|возможность|такая\s+услуга)/i.test(msg) ||
        /есть\s+ли\s+у\s+вас/i.test(msg) ||
        /предоставляете\s+ли|оказываете\s+ли|делаете\s+ли\s+вы|делают\s+ли\s+у\s+вас/i.test(msg) ||
        /наличие|имеется\s+ли|имеют\s+ли\s+у\s+вас/i.test(msg) ||
        /возможно\s+ли\s+у\s+вас|можно\s+ли\s+у\s+вас\s+(сделать|записаться|получить)/i.test(msg) ||
        /у\s+вас\s+есть|в\s+клинике\s+есть|есть\s+ли\s+в\s+вашей/i.test(msg) ||
        /делаете\s+ли\s+вы\s+(кастрац|стерилиз|узи|рентген|анализ|прививк|груминг|стрижк)/i.test(msg)
    );
}

/** Описание симптомов или проблемы с питомцем — ищем в RAG и интернете, предлагаем запись */
export function isSymptomsOrPetProblem(text: string): boolean {
    const msg = (text || '').toLowerCase();
    if (msg.length < 10) return false;
    return /рвот|понос|не ест|вял|чешется|хромает|кашл|температур|симптом|болит|отказывается от еды|не пьет|не пьёт|опух|ранен|травм|укус|отравл|аллерг|зуд|выпадение шерсти|чихает|сопли|глаз (течет|гноится)|ухо (болит|чешется)|хромот|судорог|слабость|аппетит|плохо ест|рвет|рвёт|тошн|стул|кровь в|крови в|что с (кошкой|собакой|питомцем)|кошка (не |плохо )|собака (не |плохо )|питомец (не |плохо )|что делать если|помогите.*(кот|кошк|собак|пёс|питомец)/i.test(msg);
}

/** Признаки, при которых ОБЯЗАТЕЛЬНА передача диалога оператору (приоритет выше остальных) */
const OPERATOR_EMERGENCY = /не\s+ест|рвот|рвёт|рвет|сильная\s+слабость|судорог|резкое\s+ухудшение|очень\s+плохо|не\s+знаем\s+что\s+делать|не\s+знаю\s+что\s+делать/;
const OPERATOR_POSTOP = /шов|после\s+операц|послеоперационн|припухлость\s+(шва|в\s+области)|выделения\s+(из\s+шва|после)|боль\s+после\s+операц|уплотнен(ие|ия)|после\s+стерилизац|после\s+кастрац/;
const OPERATOR_PRESCRIPTIONS = /дозировк|как\s+давать\s+лекарств|аналог(и|ов)\s+препарат|совместимость\s+препарат|сколько\s+давать\s+таблетк|как\s+применять\s+препарат/;
const OPERATOR_PHARMACY = /наличие\s+препарат|есть\s+ли\s+(препарат|лекарств)|в\s+аптеке|аптек|стоимость\s+(препарат|лекарств)|аналог\s+(препарат|лекарств|таблетк)/;
const OPERATOR_NONSTANDARD = /недоволен|не\s+доволен|настаиваю|настаивает|путаюсь\s+в\s+услугах|не\s+могу\s+разобраться|эмоционально|возмущён|возмущен|ужас(но|ный)\s+сервис|плохой\s+сервис/;

/** Сообщение подходит под пункты 4.1–4.6 — передача оператору в приоритете */
export function isOperatorRequired(text: string): boolean {
    const msg = (text || '').trim();
    if (msg.length < 3) return false;
    return (
        OPERATOR_EMERGENCY.test(msg) ||
        OPERATOR_POSTOP.test(msg) ||
        OPERATOR_PRESCRIPTIONS.test(msg) ||
        OPERATOR_PHARMACY.test(msg) ||
        OPERATOR_NONSTANDARD.test(msg)
    );
}

/** Краткая причина для уведомления модератора по тексту сообщения */
export function getOperatorRequiredReason(text: string): string {
    const msg = (text || '').trim();
    if (OPERATOR_EMERGENCY.test(msg)) return 'экстренное состояние (симптомы 4.2)';
    if (OPERATOR_POSTOP.test(msg)) return 'послеоперационный вопрос (4.3)';
    if (OPERATOR_PRESCRIPTIONS.test(msg)) return 'медицинские назначения / дозировки (4.4)';
    if (OPERATOR_PHARMACY.test(msg)) return 'аптека / препараты (4.5)';
    if (OPERATOR_NONSTANDARD.test(msg)) return 'нестандартный кейс / недовольство (4.6)';
    return 'требуется помощь оператора';
}
