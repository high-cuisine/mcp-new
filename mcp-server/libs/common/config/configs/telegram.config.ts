import env from '../config.validator'

export default () => ({
    token: env.get('TELEGRAM_BOT_TOKEN').required().asString(),
})