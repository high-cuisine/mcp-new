export interface ApplicantReviewedWebhookPayload {
    applicantId: string;
    inspectionId: string;
    correlationId: string;
    levelName: string;
    externalUserId: string;
    sourceKey?: string;
    type: 'applicantReviewed' | 'applicantCreated' | 'applicantUpdated';
    sandboxMode: boolean;
    reviewStatus: 'init' | 'pending' | 'prechecked' | 'queued' | 'completed' | 'onHold';
    createdAtMs: string;
    applicantType: 'individual' | 'company';
    reviewResult: {
      reviewAnswer: 'GREEN' | 'RED' | 'YELLOW' | 'ERROR';
      moderationComment?: string;
      clientComment?: string;
      rejectLabels?: string[];
      reviewRejectType?: 'FINAL' | 'RETRY';
    };
  }



  
// applicantId: уникальный идентификатор пользователя (заявителя) в системе IDnGO
// inspectionId: уникальный идентификатор конкретного запуска проверки KYC
// correlationId: сквозной идентификатор запроса для логирования и трассировки
// levelName: название уровня проверки (например, basic-kyc-level), настроенное в Dashboard
// externalUserId: ваш собственный идентификатор пользователя, переданный при создании заявки
// sourceKey?: необязательное поле — ваш кастомный ключ источника, если указан при создании
// type: тип события вебхука — всегда applicantReviewed
// sandboxMode: true для песочницы (sandbox), false для продакшена
// reviewStatus: текущий статус проверки — init | pending | prechecked | queued | completed | onHold
// createdAtMs: метка времени генерации вебхука в формате "YYYY-MM-DD HH:mm:ss.SSS"
// applicantType: тип заявителя — individual (физлицо) или company (юрлицо)
// reviewResult.reviewAnswer: итоговый ответ проверки — GREEN (пройдено) или RED (не пройдено)
// reviewResult.moderationComment?: опциональный текст для пользователя при отказе или доп. информации
// reviewResult.clientComment?: опциональный внутренний комментарий для систем (не показывается пользователю)
// reviewResult.rejectLabels?: опционально, при RED — массив кодов причин отказа
// reviewResult.reviewRejectType?: опционально, тип отказа — FINAL (окончательный) или RETRY (можно повторить)
