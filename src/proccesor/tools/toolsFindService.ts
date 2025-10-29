// Описываете свои инструменты для OpenAI
const toolsFindService = [
   
    {
      type: "function",
      function: {
        name: "find_service",
        description: "Найти услугу для клиента. Используй когда пользователь хочет найти услугу для своего питомца.",
        parameters: {
          type: "object",
          properties: {
            client_problem: {
              type: "string",
              description: "Проблема клиента"
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

  export default toolsFindService;