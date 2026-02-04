import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageDTO } from './dto/messages.dto';
import { RedisService } from '@infra/redis/redis.service';
import {
  AppointmentState,
  CreateAppointmentScene,
  SceneHandleResult,
} from './scenes/create-appointment.scene';
import {
  ConfirmAppointmentState,
  ConfirmAppointmentScene,
  ConfirmAppointmentSceneHandleResult,
} from './scenes/confirm-appointment.scene';
import {
  MoveAppointmentState,
  MoveAppointmentScene,
  MoveAppointmentSceneHandleResult,
} from './scenes/move-appointment.scene';
import {
  ShowAppointmentState,
  ShowAppointmentScene,
  ShowAppointmentSceneHandleResult,
} from './scenes/show-appointment.scene';
import {
  CancelAppointmentState,
  CancelAppointmentScene,
  CancelAppointmentSceneHandleResult,
} from './scenes/cancel-appointment.scene';
import { ProccesorService } from 'src/proccesor/services/proccesor.service';
import { ChatMsg } from 'src/proccesor/interface/chat.interface';
import { cfg } from '@common/config/config.service';
import { CrmService } from 'src/crm/services/crm.service';
import { AppointmentService } from 'src/crm/services/appointments.service';
import { ClientService } from 'src/crm/services/client.service';
import { DoctorService } from 'src/crm/services/doctor.service';
import { ClientRepository } from 'src/client/repositorys/client.repository';
import { Moderator, ModeratorDocument } from './schemas/moderator.schema';

export interface HandleMessageResponse {
  messages: string[];
}

type SceneStateUnion =
  | AppointmentState
  | ConfirmAppointmentState
  | MoveAppointmentState
  | ShowAppointmentState
  | CancelAppointmentState;

type SceneResultUnion =
  | SceneHandleResult
  | ConfirmAppointmentSceneHandleResult
  | MoveAppointmentSceneHandleResult
  | ShowAppointmentSceneHandleResult
  | CancelAppointmentSceneHandleResult;

interface SceneSessionState {
  name: string;
  state: SceneStateUnion;
}

interface UserSessionState {
  activeScene?: SceneSessionState;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class TelegramBotsService {
  private readonly logger = new Logger(TelegramBotsService.name);
  private readonly sessionTtlSeconds = 60 * 60 * 6; // 6 hours
  private readonly sessionKeyPrefix = 'tg-bot:session:';
  private readonly historyKeyPrefix = 'tg-bot:history:';
  private readonly historyLimit = 12;
  private readonly authKeyPrefix = 'tg-auth:';

  private readonly scenes = new Map<
    string,
    | CreateAppointmentScene
    | ConfirmAppointmentScene
    | MoveAppointmentScene
    | ShowAppointmentScene
    | CancelAppointmentScene
  >();

  constructor(
    private readonly redisService: RedisService,
    private readonly proccesorService: ProccesorService,
    private readonly crmService: CrmService,
    @Inject(forwardRef(() => AppointmentService))
    private readonly appointmentService: AppointmentService,
    private readonly clientService: ClientService,
    private readonly doctorService: DoctorService,
    private readonly clientRepository: ClientRepository,
    @InjectModel(Moderator.name) private readonly moderatorModel: Model<ModeratorDocument>,
  ) {
    this.registerScenes();
    
  }

  async sendMessage(phone: string, message: string): Promise<void> {
    //post request to telegram-bot/send-message
    await fetch(`${cfg.app.telegramUrl}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        message,
      }),
    });
  
  }

  async handleMessage(dto: MessageDTO): Promise<HandleMessageResponse> {
    const incomingMessage = dto.message?.trim();

    if (!incomingMessage) {
      return {
        messages: ['Я не смог распознать сообщение. Повторите, пожалуйста.'],
      };
    }

    const telegramId = dto.telegramId;

    if (this.isResetCommand(incomingMessage)) {
      await this.clearSessionState(telegramId);
      await this.clearHistory(telegramId);
      return {
        messages: ['Диалог сброшен. Чтобы начать создание записи, отправьте любое сообщение.'],
      };
    }

    const session = await this.getSessionState(telegramId);

    if (session.activeScene) {
      return this.handleSceneMessage(telegramId, incomingMessage, session.activeScene);
    }

    return this.handleRegularMessage(telegramId, incomingMessage);
  }

  private async handleSceneMessage(
    telegramId: string,
    incomingMessage: string,
    sceneState: SceneSessionState,
  ): Promise<HandleMessageResponse> {
    // Проверяем, хочет ли пользователь выйти из сцены
    try {
      const user = await this.clientRepository.findByTelegramId(telegramId);
      if (user) {
        const userObj = user.toObject ? user.toObject() : (user as any);
        const messages = userObj?.messages;
        
        if (messages && Array.isArray(messages) && messages.length > 0) {
          // Берем последние 5 сообщений из MongoDB
          const lastMessages = messages.slice(-5);
          const messagesForCheck: ChatMsg[] = lastMessages.map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.text || msg.content || '',
          }));

          // Добавляем текущее сообщение пользователя
          messagesForCheck.push({ role: 'user', content: incomingMessage });

          // Проверяем, продолжать ли сцену
          const shouldContinue = await this.proccesorService.checkIsContinueScnene(messagesForCheck);
          
          if (!shouldContinue) {
            // Пользователь хочет выйти из сцены - очищаем состояние и обрабатываем как обычное сообщение
            this.logger.log(`User ${telegramId} wants to exit scene "${sceneState.name}"`);
            await this.clearSessionState(telegramId);
            return this.handleRegularMessage(telegramId, incomingMessage);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error checking scene exit for ${telegramId}:`, error);
      // В случае ошибки продолжаем обработку сцены
    }

    const scene = this.scenes.get(sceneState.name);

    if (!scene) {
      this.logger.warn(`Scene "${sceneState.name}" not found. Resetting session for ${telegramId}.`);
      await this.clearSessionState(telegramId);
      return {
        messages: ['Произошла ошибка при обработке диалога. Начнем заново. Напишите сообщение ещё раз.'],
      };
    }

    let result: SceneResultUnion;
    
    switch (sceneState.name) {
      case 'confirm_appointment': {
        result = await (scene as ConfirmAppointmentScene).handleMessage(
          sceneState.state as ConfirmAppointmentState,
          incomingMessage,
        );
        break;
      }
      case 'move_appointment': {
        result = await (scene as MoveAppointmentScene).handleMessage(
          sceneState.state as MoveAppointmentState,
          incomingMessage,
        );
        break;
      }
      case 'show_appointment': {
        result = await (scene as ShowAppointmentScene).handleMessage(
          sceneState.state as ShowAppointmentState,
          incomingMessage,
        );
        break;
      }
      case 'cancel_appointment': {
        result = await (scene as CancelAppointmentScene).handleMessage(
          sceneState.state as CancelAppointmentState,
          incomingMessage,
        );
        break;
      }
      default: {
        result = await (scene as CreateAppointmentScene).handleMessage(
          sceneState.state as AppointmentState,
          incomingMessage,
        );
        break;
      }
    }

    // Обработка действий для сцены подтверждения приема
    if (result.completed && sceneState.name === 'confirm_appointment' && 'action' in result) {
      const confirmResult = result as ConfirmAppointmentSceneHandleResult;
      const confirmState = sceneState.state as ConfirmAppointmentState;
      
      if (confirmResult.action === 'confirm') {
        try {
          await this.crmService.confirmAppointment(confirmState.data.appointmentId);
          this.logger.log(`Appointment ${confirmState.data.appointmentId} confirmed by ${telegramId}`);
        } catch (error) {
          this.logger.error(`Error confirming appointment ${confirmState.data.appointmentId}:`, error);
        }
      } else if (confirmResult.action === 'cancel') {
        try {
          await this.crmService.chanelAppointment(confirmState.data.appointmentId);
          this.logger.log(`Appointment ${confirmState.data.appointmentId} cancelled by ${telegramId}`);
        } catch (error) {
          this.logger.error(`Error cancelling appointment ${confirmState.data.appointmentId}:`, error);
        }
      }
    }

    const exitScene =
      'exitScene' in result && (result as { exitScene?: boolean }).exitScene === true;
    if (result.completed || exitScene) {
      await this.clearSessionState(telegramId);
    } else {
      await this.saveSessionState(telegramId, {
        activeScene: {
          name: sceneState.name,
          state: result.state,
        },
      });
    }

    return {
      messages: result.responses.length
        ? result.responses
        : ['Я вас не расслышал. Повторите, пожалуйста.'],
    };
  }

  private async handleRegularMessage(telegramId: string, message: string): Promise<HandleMessageResponse> {
    const history = await this.getHistory(telegramId);

    const requestMessages: ChatMsg[] = [
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: message },
    ];

    let response;
    try {
      response = await this.proccesorService.sendMessage(requestMessages, telegramId);
    } catch (error) {
      this.logger.error('Ошибка при обращении к LLM', error);
      return {
        messages: ['Произошла ошибка при обработке сообщения. Попробуйте позже.'],
      };
    }

    if (response?.notifyModerator) {
      await this.notifyModerators(response.notifyModerator);
    }

    switch (response.type) {
      case 'create_appointment':
        return this.startScene(telegramId, 'create_appointment', history.concat({ role: 'user', content: message }));

      case 'move_appointment':
        return this.startScene(telegramId, 'move_appointment', history.concat({ role: 'user', content: message }));

      case 'show_appointment':
        return this.startScene(telegramId, 'show_appointment', history.concat({ role: 'user', content: message }));

      case 'cancel_appointment':
        return this.startScene(telegramId, 'cancel_appointment', history.concat({ role: 'user', content: message }));

      case 'text': {
        const reply = response.content?.trim() || 'Я записал ваше сообщение.';
        await this.saveHistory(
          telegramId,
          this.appendToHistory(history, { role: 'user', content: message }, { role: 'assistant', content: reply }),
        );
        return { messages: [reply] };
      }

      default: {
        this.logger.warn(`Неизвестный тип ответа ${response.type}`);
        return {
          messages: ['Я пока не умею выполнять эту команду, но уже работаю над этим.'],
        };
      }
    }
  }

  private async startScene(
    telegramId: string,
    sceneName: string,
    history: StoredMessage[],
  ): Promise<HandleMessageResponse> {
    const scene = this.scenes.get(sceneName);

    if (!scene) {
      this.logger.warn(`Scene "${sceneName}" is not registered.`);
      return {
        messages: ['Пока не могу помочь с этим. Давайте вернемся позже.'],
      };
    }

    let initialState: SceneStateUnion;
    let result: SceneResultUnion;
    
    switch (sceneName) {
      case 'confirm_appointment': {
        this.logger.warn(`Cannot start confirm_appointment scene without appointmentId`);
        return {
          messages: ['Произошла ошибка при запуске сцены.'],
        };
      }
      case 'move_appointment': {
        const moveScene = scene as MoveAppointmentScene;
        const moveInitial = moveScene.getInitialState();
        initialState = moveInitial;
        result = await moveScene.handleMessage(moveInitial, '');
        break;
      }
      case 'show_appointment': {
        const showScene = scene as ShowAppointmentScene;
        const showInitial = showScene.getInitialState();
        initialState = showInitial;
        result = await showScene.handleMessage(showInitial, '');
        break;
      }
      case 'cancel_appointment': {
        const cancelScene = scene as CancelAppointmentScene;
        const cancelInitial = cancelScene.getInitialState();
        initialState = cancelInitial;
        result = await cancelScene.handleMessage(cancelInitial, '');
        break;
      }
      default: {
        const createScene = scene as CreateAppointmentScene;
        const createInitial = createScene.getInitialState();
        initialState = createInitial;
        result = await createScene.handleMessage(createInitial, '');
        break;
      }
    }

    await this.saveSessionState(telegramId, {
      activeScene: {
        name: sceneName,
        state: result.state,
      },
    });

    await this.saveHistory(telegramId, this.trimHistory(history));

    return {
      messages: result.responses.length
        ? result.responses
        : ['Давайте начнем. Расскажите, пожалуйста, какие симптомы у питомца.'],
    };
  }

  private appendToHistory(
    history: StoredMessage[],
    ...newMessages: StoredMessage[]
  ): StoredMessage[] {
    return this.trimHistory([...history, ...newMessages]);
  }

  private trimHistory(history: StoredMessage[]): StoredMessage[] {
    if (history.length <= this.historyLimit) {
      return history;
    }
    return history.slice(history.length - this.historyLimit);
  }

  private async notifyModerators(message: string): Promise<void> {
    if (!message) return;

    try {
      const moderators = await this.moderatorModel.find().lean();
      if (!moderators?.length) return;

      const token = cfg.telegram.token;
      if (!token) {
        this.logger.warn('Telegram token not configured, cannot notify moderators');
        return;
      }

      for (const moderator of moderators) {
        const chatId = (moderator as any)?.telegramId;
        if (!chatId) continue;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
          }),
        }).catch((err) => {
          this.logger.error(`Failed to notify moderator ${chatId}`, err);
        });
      }
    } catch (error) {
      this.logger.error('Ошибка при отправке уведомления модераторам', error);
    }
  }

  private registerScenes(): void {
    this.scenes.set('create_appointment', new CreateAppointmentScene(this.crmService, this.doctorService, this.proccesorService));
    this.scenes.set('confirm_appointment', new ConfirmAppointmentScene(this.proccesorService));
    this.scenes.set(
      'move_appointment',
      new MoveAppointmentScene(this.crmService, this.appointmentService, this.clientService, this.proccesorService),
    );
    this.scenes.set('show_appointment', new ShowAppointmentScene(this.appointmentService, this.clientService, this.proccesorService));
    this.scenes.set(
      'cancel_appointment',
      new CancelAppointmentScene(this.appointmentService, this.clientService, this.crmService, this.proccesorService),
    );
  }

  async startConfirmAppointmentScene(telegramId: string, appointmentId: string, phone?: string): Promise<void> {
    const scene = this.scenes.get('confirm_appointment') as ConfirmAppointmentScene;
    
    if (!scene) {
      this.logger.warn('ConfirmAppointmentScene is not registered.');
      return;
    }

    const initialState = scene.getInitialState(appointmentId);
    const result = await scene.handleMessage(initialState, '');

    await this.saveSessionState(telegramId, {
      activeScene: {
        name: 'confirm_appointment',
        state: result.state,
      },
    });

    // Отправляем начальное сообщение сцены пользователю
    if (result.responses && result.responses.length > 0 && phone) {
      for (const message of result.responses) {
        await this.sendMessage(phone, message);
      }
    }
  }

  private getSessionKey(telegramId: string): string {
    return `${this.sessionKeyPrefix}${telegramId}`;
  }

  private getHistoryKey(telegramId: string): string {
    return `${this.historyKeyPrefix}${telegramId}`;
  }

  private async getSessionState(telegramId: string): Promise<UserSessionState> {
    const raw = await this.redisService.get(this.getSessionKey(telegramId));
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw) as UserSessionState;
    } catch (error) {
      this.logger.warn(`Не удалось распарсить состояние пользователя ${telegramId}: ${raw}`);
      return {};
    }
  }

  private async saveSessionState(telegramId: string, state: UserSessionState): Promise<void> {
    await this.redisService.set(this.getSessionKey(telegramId), JSON.stringify(state), {
      EX: this.sessionTtlSeconds,
    });
  }

  private async clearSessionState(telegramId: string): Promise<void> {
    await this.redisService.delete(this.getSessionKey(telegramId));
  }

  private async getHistory(telegramId: string): Promise<StoredMessage[]> {
    const raw = await this.redisService.get(this.getHistoryKey(telegramId));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as StoredMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.logger.warn(`Не удалось распарсить историю пользователя ${telegramId}: ${raw}`);
      return [];
    }
  }

  private async saveHistory(telegramId: string, history: StoredMessage[]): Promise<void> {
    await this.redisService.set(this.getHistoryKey(telegramId), JSON.stringify(history), {
      EX: this.sessionTtlSeconds,
    });
  }

  private async clearHistory(telegramId: string): Promise<void> {
    await this.redisService.delete(this.getHistoryKey(telegramId));
  }

  private isResetCommand(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return ['/exit', '/cancel', '/stop', 'отмена'].includes(normalized);
  }

  async sendMessageToModerators(message:string) {
    
  }

  async initAuth(apiId: number, apiHash: string, phoneNumber: string): Promise<{ phoneCodeHash: string; message: string }> {
    const authKey = `${this.authKeyPrefix}${phoneNumber}`;
    const authData = {
      apiId,
      apiHash,
      phoneNumber,
      timestamp: Date.now(),
    };
    
    await this.redisService.set(authKey, JSON.stringify(authData), { EX: 300 }); // 5 минут

    // Отправляем запрос на telegram-bot для инициализации авторизации
    const response = await fetch(`${cfg.app.telegramUrl}/auth/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId, apiHash, phoneNumber }),
    });

    if (!response.ok) {
      throw new Error(`Failed to init auth: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  }

  async verifyCode(phoneNumber: string, code: string, phoneCodeHash: string): Promise<{ success: boolean; session?: string; needsPassword?: boolean; message: string }> {
    const authKey = `${this.authKeyPrefix}${phoneNumber}`;
    const authDataStr = await this.redisService.get(authKey);
    
    if (!authDataStr) {
      throw new Error('Authorization session expired. Please start again.');
    }

    const response = await fetch(`${cfg.app.telegramUrl}/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code, phoneCodeHash }),
    });

    if (!response.ok) {
      throw new Error(`Failed to verify code: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.success && result.session) {
      // Сохраняем сессию
      await this.redisService.set(`${this.authKeyPrefix}session:${phoneNumber}`, result.session, { EX: 86400 * 30 }); // 30 дней
      await this.redisService.delete(authKey);
    }
    
    return result;
  }

  async verifyPassword(phoneNumber: string, password: string, phoneCodeHash: string): Promise<{ success: boolean; session?: string; message: string }> {
    const authKey = `${this.authKeyPrefix}${phoneNumber}`;
    const authDataStr = await this.redisService.get(authKey);
    
    if (!authDataStr) {
      throw new Error('Authorization session expired. Please start again.');
    }

    const response = await fetch(`${cfg.app.telegramUrl}/auth/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, password, phoneCodeHash }),
    });

    if (!response.ok) {
      throw new Error(`Failed to verify password: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.success && result.session) {
      // Сохраняем сессию
      await this.redisService.set(`${this.authKeyPrefix}session:${phoneNumber}`, result.session, { EX: 86400 * 30 }); // 30 дней
      await this.redisService.delete(authKey);
    }
    
    return result;
  }

  async getAuthStatus(phoneNumber: string): Promise<{ hasSession: boolean }> {
    const session = await this.redisService.get(`${this.authKeyPrefix}session:${phoneNumber}`);
    return { hasSession: !!session };
  }
}
