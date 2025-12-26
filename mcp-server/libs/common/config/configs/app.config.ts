import env from '../config.validator';

export default () => ({
	port: env.get('PORT').required().asInt(),
    crmApiKey: env.get('CRM_API_KEY').required().asString(),
    telegramUrl: env.get('TELEGRAM_HOST').required().asString(),
});
