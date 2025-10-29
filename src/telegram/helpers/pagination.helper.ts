import { Markup } from 'telegraf';
import { SceneContext } from 'telegraf/typings/scenes';

export interface PaginationButton {
  text: string;
  callbackData: string;
}

export interface PaginationOptions {
  itemsPerPage?: number;
  showPageNumbers?: boolean;
  showNavigation?: boolean;
  customButtons?: PaginationButton[];
  cancelButtonText?: string;
  cancelCallbackData?: string;
}

export class PaginationHelper {
  private static readonly DEFAULT_ITEMS_PER_PAGE = 5;
  private static readonly DEFAULT_CANCEL_TEXT = '❌ Отменить';
  private static readonly DEFAULT_CANCEL_CALLBACK = 'cancel';

  /**
   * Создает клавиатуру с пагинацией для списка кнопок
   * @param items - массив элементов для отображения
   * @param currentPage - текущая страница (начиная с 1)
   * @param options - опции пагинации
   * @returns объект с клавиатурой и информацией о пагинации
   */
  static createPaginatedKeyboard(
    items: PaginationButton[],
    currentPage: number = 1,
    options: PaginationOptions = {}
  ) {
    const {
      itemsPerPage = this.DEFAULT_ITEMS_PER_PAGE,
      showPageNumbers = true,
      showNavigation = true,
      customButtons = [],
      cancelButtonText = this.DEFAULT_CANCEL_TEXT,
      cancelCallbackData = this.DEFAULT_CANCEL_CALLBACK
    } = options;

    const totalPages = Math.ceil(items.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    const currentItems = items.slice(startIndex, endIndex);

    const keyboard: any[] = [];

    // Добавляем элементы текущей страницы
    currentItems.forEach(item => {
      keyboard.push([Markup.button.callback(item.text, item.callbackData)]);
    });

    // Добавляем кастомные кнопки
    if (customButtons.length > 0) {
      customButtons.forEach(button => {
        keyboard.push([Markup.button.callback(button.text, button.callbackData)]);
      });
    }

    // Добавляем навигацию по страницам
    if (showNavigation && totalPages > 1) {
      const navigationRow: any[] = [];

      // Кнопка "Назад"
      if (currentPage > 1) {
        navigationRow.push(Markup.button.callback('◀️', `page_${currentPage - 1}`));
      }

      // Номера страниц
      if (showPageNumbers) {
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
          const isCurrentPage = i === currentPage;
          navigationRow.push(
            Markup.button.callback(
              isCurrentPage ? `[${i}]` : `${i}`,
              `page_${i}`
            )
          );
        }
      }

      // Кнопка "Вперед"
      if (currentPage < totalPages) {
        navigationRow.push(Markup.button.callback('▶️', `page_${currentPage + 1}`));
      }

      if (navigationRow.length > 0) {
        keyboard.push(navigationRow);
      }
    }

    // Добавляем кнопку отмены
    keyboard.push([Markup.button.callback(cancelButtonText, cancelCallbackData)]);

    return {
      keyboard: Markup.inlineKeyboard(keyboard),
      paginationInfo: {
        currentPage,
        totalPages,
        totalItems: items.length,
        itemsPerPage,
        startIndex: startIndex + 1,
        endIndex
      }
    };
  }

  /**
   * Отправляет сообщение с пагинированной клавиатурой
   * @param ctx - контекст сцены
   * @param message - текст сообщения
   * @param items - массив элементов для отображения
   * @param currentPage - текущая страница
   * @param options - опции пагинации
   */
  static async sendPaginatedMessage(
    ctx: SceneContext,
    message: string,
    items: PaginationButton[],
    currentPage: number = 1,
    options: PaginationOptions = {}
  ) {
    const { keyboard, paginationInfo } = this.createPaginatedKeyboard(items, currentPage, options);
    
    const pageInfo = options.showPageNumbers 
      ? `\n\n📄 Страница ${paginationInfo.currentPage} из ${paginationInfo.totalPages}`
      : '';

    await ctx.replyWithHTML(message + pageInfo, keyboard);
  }

  /**
   * Обрабатывает callback для навигации по страницам
   * @param callbackData - данные callback
   * @returns номер страницы или null, если это не навигация
   */
  static parsePageCallback(callbackData: string): number | null {
    const match = callbackData.match(/^page_(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Проверяет, является ли callback навигационным
   * @param callbackData - данные callback
   * @returns true, если это навигационный callback
   */
  static isPageCallback(callbackData: string): boolean {
    return callbackData.startsWith('page_');
  }
}