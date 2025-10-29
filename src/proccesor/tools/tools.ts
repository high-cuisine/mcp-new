// Описываете свои инструменты для OpenAI
const tools = [
    {
      type: "function",
      function: {
        name: "move_appointment",
        description: "Перенести запись на прием",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "show_appointment",
        description: "Показать запись на прием. Используй когда пользователь хочет посмотреть свои записи на прием.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "move_appointment",
        description: "Перенести запись. Используй когда пользователь хочет перенести запись",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" }
          }
        }
      }
    },
    {
      type: "function", 
      function: {
        name: "channel_appointment",
        description: "Отменить запись на прием",
        parameters: {
          // ... параметры
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_appointment",
        description: "Создать запись на прием к врачу. Используй когда пользователь хочет записаться на прием, бронирует время у врача или планирует визит в клинику.",
        parameters: {
          type: "object",
          properties: {
            doctor_name: {
              type: "string",
              description: "Имя врача или специализация (если врач не указан)"
            },
            preferred_date: {
              type: "string", 
              description: "Желаемая дата приема"
            },
            preferred_time: {
              type: "string",
              description: "Желаемое время приема"
            },
            patient_name: {
              type: "string",
              description: "ФИО пациента"
            },
            contact_phone: {
              type: "string",
              description: "Контактный телефон пациента"
            },
            reason: {
              type: "string",
              description: "Причина обращения или жалобы"
            }
          },
          required: []
        }
      }
    }
  ];

  export default tools;