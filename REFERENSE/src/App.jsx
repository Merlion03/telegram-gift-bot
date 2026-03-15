import React, { useState, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import UserPanel from './components/UserPanel'
import LoadingScreen from './components/LoadingScreen'
import TelegramOptimizer from './components/TelegramOptimizer'
import TelegramTestPanel from './components/TelegramTestPanel'
import { mockDialogs, mockMessages, mockUserData } from './data/mockData'
import { useTelegramWebApp } from './hooks/useTelegramWebApp'

function App() {
  const [darkMode, setDarkMode] = useState(true) // Темная тема по умолчанию
  const [selectedDialog, setSelectedDialog] = useState(mockDialogs[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showTestPanel, setShowTestPanel] = useState(false)

  const { 
    webApp, 
    user: tgUser, 
    isReady: tgReady, 
    themeParams,
    viewportHeight,
    platform,
    version,
    colorScheme,
    startParam,
    showAlert, 
    showConfirm, 
    showPopup,
    hapticFeedback,
    setMainButton,
    setBackButton,
    setSettingsButton,
    sendData,
    readTextFromClipboard
  } = useTelegramWebApp()

  useEffect(() => {
    // Обрабатываем параметры запуска Main Mini App
    if (startParam) {
      console.log('Processing start parameter:', startParam)
      
      switch (startParam) {
        case 'support':
          // Открываем панель поддержки
          showAlert('Добро пожаловать в панель поддержки!')
          break
        case 'analytics':
          // Показываем аналитику
          showAlert('Открываем раздел аналитики...')
          break
        case 'vip':
          // Фильтруем только VIP клиентов
          setActiveFilter('vip')
          showAlert('Показываем только VIP клиентов')
          break
        case 'new':
          // Показываем только новые диалоги
          setActiveFilter('new')
          showAlert('Показываем только новые диалоги')
          break
        case 'test':
          // Открываем тестовую панель
          setShowTestPanel(true)
          showAlert('Открываем панель тестирования бота')
          break
        default:
          console.log('Unknown start parameter:', startParam)
      }
    }
  }, [startParam, showAlert, setActiveFilter])

  useEffect(() => {
    // Имитация загрузки приложения
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2000) // 2 секунды загрузки

    return () => clearTimeout(timer)
  }, [])

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
    hapticFeedback('selection')
    
    // Отправляем информацию о смене темы в Telegram
    if (tgReady) {
      sendData({
        action: 'theme_changed',
        theme: !darkMode ? 'dark' : 'light',
        timestamp: Date.now()
      })
    }
  }

  useEffect(() => {
    // Настройка Telegram WebApp после готовности
    if (tgReady && webApp) {
      // Расширяем WebApp на весь экран
      webApp.expand()
      
      // Отключаем вертикальные свайпы
      webApp.disableVerticalSwipes()
      
      // Настраиваем цвета интерфейса под тему Telegram
      if (themeParams) {
        document.documentElement.style.setProperty('--tg-bg-color', themeParams.bg_color || '#ffffff')
        document.documentElement.style.setProperty('--tg-text-color', themeParams.text_color || '#000000')
        document.documentElement.style.setProperty('--tg-hint-color', themeParams.hint_color || '#999999')
        document.documentElement.style.setProperty('--tg-link-color', themeParams.link_color || '#2481cc')
        document.documentElement.style.setProperty('--tg-button-color', themeParams.button_color || '#2481cc')
        document.documentElement.style.setProperty('--tg-button-text-color', themeParams.button_text_color || '#ffffff')
        
        // Устанавливаем цвет заголовка
        webApp.setHeaderColor(themeParams.secondary_bg_color || themeParams.bg_color || '#ffffff')
      }
      
      // Настраиваем главную кнопку для отправки сообщения
      setMainButton('Отправить сообщение', false, () => {
        showAlert('Функция отправки сообщений активирована!')
        hapticFeedback('notification', 'success')
      })
      
      // Настраиваем кнопку назад для свернутого сайдбара
      if (sidebarCollapsed) {
        setBackButton(true, () => {
          setSidebarCollapsed(false)
          hapticFeedback('impact', 'light')
        })
      } else {
        setBackButton(false)
      }

      // Настраиваем кнопку настроек
      setSettingsButton(true, () => {
        showPopup({
          title: 'Настройки',
          message: 'Здесь будут настройки приложения',
          buttons: [
            { id: 'theme', type: 'default', text: 'Сменить тему' },
            { id: 'test', type: 'default', text: 'Тестирование бота' },
            { id: 'notifications', type: 'default', text: 'Уведомления' },
            { id: 'close', type: 'cancel', text: 'Закрыть' }
          ]
        }, (buttonId) => {
          if (buttonId === 'theme') {
            toggleDarkMode()
          } else if (buttonId === 'test') {
            setShowTestPanel(!showTestPanel)
          } else if (buttonId === 'notifications') {
            showAlert('Настройки уведомлений')
          }
        })
      })

      // Адаптируем интерфейс под платформу
      if (platform === 'ios') {
        document.body.classList.add('ios-platform')
      } else if (platform === 'android') {
        document.body.classList.add('android-platform')
      }

      // Адаптируем под размер экрана
      if (viewportHeight < 600) {
        document.body.classList.add('compact-mode')
      }
      
      // Добавляем класс для Telegram WebApp
      document.body.classList.add('telegram-webapp')
    }
  }, [tgReady, webApp, sidebarCollapsed, platform, viewportHeight, themeParams, setMainButton, setBackButton, setSettingsButton, hapticFeedback, showAlert, showPopup, toggleDarkMode])

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
    hapticFeedback('impact', 'light')
  }

  const handleDialogSelect = (dialog) => {
    setSelectedDialog(dialog)
    hapticFeedback('selection')
    
    // Показываем уведомление при выборе VIP клиента
    if (dialog.priority) {
      showAlert(`Выбран VIP клиент: ${dialog.name}`)
    }

    // Отправляем данные о выбранном диалоге в Telegram
    if (tgReady) {
      sendData({
        action: 'dialog_selected',
        dialog_id: dialog.id,
        dialog_name: dialog.name,
        is_vip: dialog.priority || false,
        timestamp: Date.now()
      })
    }
  }

  const filteredDialogs = mockDialogs.filter(dialog => {
    const matchesSearch = searchQuery === '' || 
                         dialog.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         dialog.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         dialog.id.toString().includes(searchQuery)
    const matchesFilter = activeFilter === 'all' || dialog.status === activeFilter
    return matchesSearch && matchesFilter
  })

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <TelegramOptimizer>
      <div className={`telegram-webapp ${darkMode ? 'dark' : ''}`}>
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <Header 
            stats={{
              total: mockDialogs.length,
              new: mockDialogs.filter(d => d.status === 'new').length,
              active: mockDialogs.filter(d => d.status === 'active').length
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
          
          <div className="flex-1 flex overflow-hidden min-h-0">
            <Sidebar 
              dialogs={filteredDialogs}
              selectedDialog={selectedDialog}
              onSelectDialog={setSelectedDialog}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebar}
            />
            
            {showTestPanel ? (
              <div className="flex-1 overflow-hidden">
                <TelegramTestPanel />
              </div>
            ) : (
              <>
                <ChatWindow 
                  dialog={selectedDialog}
                  messages={mockMessages[selectedDialog.id] || []}
                />
                
                <UserPanel 
                  user={mockUserData[selectedDialog.id] || mockUserData[214]}
                  dialog={selectedDialog}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </TelegramOptimizer>
  )
}

export default App
