export const mockDialogs = [
  {
    id: 214,
    name: 'Анна Петрова',
    username: '@anna_p',
    avatar: 'АП',
    lastMessage: 'Спасибо за помощь! Все работает',
    time: '14:32',
    unread: 0,
    status: 'closed',
    priority: false,
    online: false,
    operator: 'Вы'
  },
  {
    id: 988,
    name: 'Дмитрий Иванов',
    username: '@dmitry_iv',
    avatar: 'ДИ',
    lastMessage: 'Когда можно ожидать ответ?',
    time: '14:28',
    unread: 3,
    status: 'new',
    priority: true,
    online: true,
    operator: null
  },
  {
    id: 156,
    name: 'Елена Смирнова',
    username: '@elena_s',
    avatar: 'ЕС',
    lastMessage: 'Отлично, жду информацию',
    time: '13:45',
    unread: 0,
    status: 'active',
    priority: false,
    online: false,
    operator: 'Мария К.'
  },
  {
    id: 342,
    name: 'Алексей Козлов',
    username: '@alex_kozlov',
    avatar: 'АК',
    lastMessage: 'Здравствуйте, у меня вопрос по оплате',
    time: '12:15',
    unread: 1,
    status: 'new',
    priority: false,
    online: false,
    operator: null
  },
  {
    id: 789,
    name: 'Мария Волкова',
    username: '@maria_v',
    avatar: 'МВ',
    lastMessage: 'Спасибо, все понятно!',
    time: '11:30',
    unread: 0,
    status: 'active',
    priority: false,
    online: true,
    operator: 'Вы'
  },
  {
    id: 523,
    name: 'Сергей Новиков',
    username: '@sergey_n',
    avatar: 'СН',
    lastMessage: 'Можно уточнить детали?',
    time: '10:22',
    unread: 2,
    status: 'active',
    priority: true,
    online: false,
    operator: 'Вы'
  }
]

export const mockMessages = {
  214: [ // Анна Петрова
    {
      id: 1,
      type: 'system',
      text: 'Диалог начат 10 марта в 14:15',
      time: '14:15'
    },
    {
      id: 2,
      type: 'incoming',
      text: 'Здравствуйте! У меня возник вопрос по вашему сервису',
      time: '14:16',
      sender: 'user'
    },
    {
      id: 3,
      type: 'incoming',
      text: 'Как можно оформить подписку на премиум?',
      time: '14:16',
      sender: 'user'
    },
    {
      id: 4,
      type: 'outgoing',
      text: 'Здравствуйте! Рад помочь вам с оформлением подписки.',
      time: '14:18',
      sender: 'operator',
      operatorName: 'Вы'
    },
    {
      id: 5,
      type: 'outgoing',
      text: 'Для оформления премиум-подписки вам нужно:\n1. Перейти в раздел "Подписки"\n2. Выбрать подходящий тариф\n3. Оплатить любым удобным способом',
      time: '14:18',
      sender: 'operator',
      operatorName: 'Вы'
    },
    {
      id: 6,
      type: 'incoming',
      text: 'Спасибо за помощь! Все работает',
      time: '14:32',
      sender: 'user'
    },
    {
      id: 7,
      type: 'outgoing',
      text: 'Отлично! Рад, что смог помочь. Обращайтесь, если возникнут вопросы!',
      time: '14:33',
      sender: 'operator',
      operatorName: 'Вы'
    }
  ],
  988: [ // Дмитрий Иванов
    {
      id: 1,
      type: 'system',
      text: 'Диалог начат 10 марта в 14:25',
      time: '14:25'
    },
    {
      id: 2,
      type: 'incoming',
      text: 'Добрый день! Я жду ответ на свой вопрос уже несколько часов',
      time: '14:26',
      sender: 'user'
    },
    {
      id: 3,
      type: 'incoming',
      text: 'Когда можно ожидать ответ?',
      time: '14:28',
      sender: 'user'
    },
    {
      id: 4,
      type: 'note',
      text: 'VIP клиент, требует приоритетного обслуживания',
      time: '14:29',
      author: 'Система'
    }
  ],
  156: [ // Елена Смирнова
    {
      id: 1,
      type: 'system',
      text: 'Диалог начат 10 марта в 13:40',
      time: '13:40'
    },
    {
      id: 2,
      type: 'incoming',
      text: 'Здравствуйте! Можете прислать дополнительную информацию?',
      time: '13:42',
      sender: 'user'
    },
    {
      id: 3,
      type: 'outgoing',
      text: 'Конечно! Сейчас подготовлю для вас материалы.',
      time: '13:43',
      sender: 'operator',
      operatorName: 'Мария К.'
    },
    {
      id: 4,
      type: 'incoming',
      text: 'Отлично, жду информацию',
      time: '13:45',
      sender: 'user'
    },
    {
      id: 5,
      type: 'outgoing',
      text: 'Отправил вам документы на email. Проверьте, пожалуйста.',
      time: '13:50',
      sender: 'operator',
      operatorName: 'Мария К.'
    }
  ],
  342: [ // Алексей Козлов
    {
      id: 1,
      type: 'system',
      text: 'Диалог начат 10 марта в 12:10',
      time: '12:10'
    },
    {
      id: 2,
      type: 'incoming',
      text: 'Здравствуйте, у меня вопрос по оплате',
      time: '12:15',
      sender: 'user'
    },
    {
      id: 3,
      type: 'incoming',
      text: 'Деньги списались, но услуга не активировалась',
      time: '12:16',
      sender: 'user'
    }
  ],
  789: [ // Мария Волкова
    {
      id: 1,
      type: 'system',
      text: 'Диалог начат 10 марта в 11:25',
      time: '11:25'
    },
    {
      id: 2,
      type: 'incoming',
      text: 'Привет! Хотела уточнить по поводу доставки',
      time: '11:27',
      sender: 'user'
    },
    {
      id: 3,
      type: 'outgoing',
      text: 'Привет! Доставка будет завтра с 10 до 18 часов.',
      time: '11:28',
      sender: 'operator',
      operatorName: 'Вы'
    },
    {
      id: 4,
      type: 'incoming',
      text: 'Спасибо, все понятно!',
      time: '11:30',
      sender: 'user'
    },
    {
      id: 5,
      type: 'outgoing',
      text: 'Отлично! Курьер свяжется с вами за час до доставки.',
      time: '11:31',
      sender: 'operator',
      operatorName: 'Вы'
    }
  ],
  523: [ // Сергей Новиков
    {
      id: 1,
      type: 'system',
      text: 'Диалог начат 10 марта в 10:20',
      time: '10:20'
    },
    {
      id: 2,
      type: 'incoming',
      text: 'Добрый день! Интересует ваш продукт',
      time: '10:21',
      sender: 'user'
    },
    {
      id: 3,
      type: 'incoming',
      text: 'Можно уточнить детали?',
      time: '10:22',
      sender: 'user'
    },
    {
      id: 4,
      type: 'outgoing',
      text: 'Здравствуйте! Конечно, расскажу подробнее о наших услугах.',
      time: '10:25',
      sender: 'operator',
      operatorName: 'Вы'
    },
    {
      id: 5,
      type: 'outgoing',
      text: 'У нас есть несколько тарифных планов. Какой функционал вас больше интересует?',
      time: '10:26',
      sender: 'operator',
      operatorName: 'Вы'
    },
    {
      id: 6,
      type: 'note',
      text: 'Потенциальный VIP клиент, показать максимум возможностей',
      time: '10:27',
      author: 'Вы'
    }
  ]
}

export const mockUserData = {
  214: { // Анна Петрова
    id: 123456789,
    name: 'Анна Петрова',
    username: '@anna_p',
    avatar: 'АП',
    phone: '+7 (999) 123-45-67',
    email: 'anna.petrova@example.com',
    telegramId: '123456789',
    firstContact: '15 февраля 2024',
    source: 'Реклама ВКонтакте',
    status: 'Активный клиент',
    operator: 'Вы',
    tags: ['Премиум', 'Постоянный'],
    online: false,
    lastSeen: 'был недавно',
    history: [
      { date: '10 марта 2024', event: 'Оформление премиум подписки', operator: 'Вы' },
      { date: '15 февраля 2024', event: 'Первое обращение', operator: 'Система' }
    ],
    notes: [
      { date: '10 марта', author: 'Вы', text: 'Успешно оформлена премиум подписка' }
    ]
  },
  988: { // Дмитрий Иванов
    id: 987654321,
    name: 'Дмитрий Иванов',
    username: '@dmitry_iv',
    avatar: 'ДИ',
    phone: '+7 (999) 987-65-43',
    email: 'dmitry.ivanov@example.com',
    telegramId: '987654321',
    firstContact: '8 марта 2024',
    source: 'Прямой переход',
    status: 'VIP клиент',
    operator: null,
    tags: ['VIP', 'Приоритет', 'Жалоба'],
    online: true,
    lastSeen: 'онлайн',
    history: [
      { date: '10 марта 2024', event: 'Жалоба на время ответа', operator: 'Не назначен' },
      { date: '8 марта 2024', event: 'Первое обращение', operator: 'Система' }
    ],
    notes: [
      { date: '10 марта', author: 'Система', text: 'VIP клиент требует приоритетного обслуживания' }
    ]
  },
  156: { // Елена Смирнова
    id: 456789123,
    name: 'Елена Смирнова',
    username: '@elena_s',
    avatar: 'ЕС',
    phone: '+7 (999) 456-78-91',
    email: 'elena.smirnova@example.com',
    telegramId: '456789123',
    firstContact: '5 марта 2024',
    source: 'Рекомендация',
    status: 'Активный клиент',
    operator: 'Мария К.',
    tags: ['Консультация', 'Документы'],
    online: false,
    lastSeen: 'была 2 часа назад',
    history: [
      { date: '10 марта 2024', event: 'Запрос документов', operator: 'Мария К.' },
      { date: '5 марта 2024', event: 'Первое обращение', operator: 'Мария К.' }
    ],
    notes: [
      { date: '10 марта', author: 'Мария К.', text: 'Отправлены документы на email' }
    ]
  },
  342: { // Алексей Козлов
    id: 789123456,
    name: 'Алексей Козлов',
    username: '@alex_kozlov',
    avatar: 'АК',
    phone: '+7 (999) 789-12-34',
    email: 'alex.kozlov@example.com',
    telegramId: '789123456',
    firstContact: '10 марта 2024',
    source: 'Поисковая реклама',
    status: 'Новый клиент',
    operator: null,
    tags: ['Оплата', 'Проблема'],
    online: false,
    lastSeen: 'был 4 часа назад',
    history: [
      { date: '10 марта 2024', event: 'Проблема с оплатой', operator: 'Не назначен' }
    ],
    notes: []
  },
  789: { // Мария Волкова
    id: 321654987,
    name: 'Мария Волкова',
    username: '@maria_v',
    avatar: 'МВ',
    phone: '+7 (999) 321-65-49',
    email: 'maria.volkova@example.com',
    telegramId: '321654987',
    firstContact: '1 марта 2024',
    source: 'Социальные сети',
    status: 'Постоянный клиент',
    operator: 'Вы',
    tags: ['Доставка', 'Постоянный'],
    online: true,
    lastSeen: 'онлайн',
    history: [
      { date: '10 марта 2024', event: 'Вопрос по доставке', operator: 'Вы' },
      { date: '5 марта 2024', event: 'Оформление заказа #4521', operator: 'Вы' },
      { date: '1 марта 2024', event: 'Первое обращение', operator: 'Вы' }
    ],
    notes: [
      { date: '10 марта', author: 'Вы', text: 'Доставка назначена на завтра' }
    ]
  },
  523: { // Сергей Новиков
    id: 654987321,
    name: 'Сергей Новиков',
    username: '@sergey_n',
    avatar: 'СН',
    phone: '+7 (999) 654-98-73',
    email: 'sergey.novikov@example.com',
    telegramId: '654987321',
    firstContact: '10 марта 2024',
    source: 'Партнерская программа',
    status: 'Потенциальный VIP',
    operator: 'Вы',
    tags: ['VIP', 'Лид', 'Консультация'],
    online: false,
    lastSeen: 'был 1 час назад',
    history: [
      { date: '10 марта 2024', event: 'Консультация по продукту', operator: 'Вы' }
    ],
    notes: [
      { date: '10 марта', author: 'Вы', text: 'Потенциальный VIP клиент, показать максимум возможностей' }
    ]
  }
}
