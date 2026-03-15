import { useEffect, useState } from 'react'

export const useTelegramWebApp = () => {
  const [webApp, setWebApp] = useState(null)
  const [user, setUser] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const [themeParams, setThemeParams] = useState({})
  const [viewportHeight, setViewportHeight] = useState(0)
  const [startParam, setStartParam] = useState(null)

  useEffect(() => {
    // Проверяем, доступен ли Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp
      
      // Инициализируем WebApp
      tg.ready()
      tg.expand()
      
      // Получаем параметры темы
      setThemeParams(tg.themeParams)
      setViewportHeight(tg.viewportHeight)
      
      // Настраиваем тему в соответствии с Telegram
      if (tg.themeParams.bg_color) {
        document.documentElement.style.setProperty('--tg-bg-color', tg.themeParams.bg_color)
      }
      if (tg.themeParams.text_color) {
        document.documentElement.style.setProperty('--tg-text-color', tg.themeParams.text_color)
      }
      if (tg.themeParams.hint_color) {
        document.documentElement.style.setProperty('--tg-hint-color', tg.themeParams.hint_color)
      }
      if (tg.themeParams.button_color) {
        document.documentElement.style.setProperty('--tg-button-color', tg.themeParams.button_color)
      }
      if (tg.themeParams.button_text_color) {
        document.documentElement.style.setProperty('--tg-button-text-color', tg.themeParams.button_text_color)
      }
      
      // Включаем кнопку закрытия
      tg.enableClosingConfirmation()
      
      setWebApp(tg)
      setUser(tg.initDataUnsafe?.user || null)
      
      // Обрабатываем параметры запуска Main Mini App
      const launchParam = tg.initDataUnsafe?.start_param
      if (launchParam) {
        console.log('Main Mini App launched with parameter:', launchParam)
        setStartParam(launchParam)
      }
      
      // Проверяем URL параметры для прямых ссылок
      const urlParams = new URLSearchParams(window.location.search)
      const tgWebAppStartParam = urlParams.get('tgWebAppStartParam')
      if (tgWebAppStartParam) {
        console.log('Direct link parameter:', tgWebAppStartParam)
        setStartParam(tgWebAppStartParam)
      }
      
      setIsReady(true)

      // Обработчик изменения размера viewport
      const handleViewportChanged = () => {
        setViewportHeight(tg.viewportHeight)
      }

      // Обработчик изменения темы
      const handleThemeChanged = () => {
        setThemeParams(tg.themeParams)
      }

      // Добавляем обработчики событий
      tg.onEvent('viewportChanged', handleViewportChanged)
      tg.onEvent('themeChanged', handleThemeChanged)
      
      return () => {
        tg.offEvent('viewportChanged', handleViewportChanged)
        tg.offEvent('themeChanged', handleThemeChanged)
      }
    } else {
      // Если не в Telegram, используем моковые данные
      setUser({
        id: 123456789,
        first_name: 'Иван',
        last_name: 'Операторов',
        username: 'ivan_operator',
        language_code: 'ru',
        is_premium: false
      })
      setThemeParams({
        bg_color: '#212d3b',
        text_color: '#ffffff',
        hint_color: '#708499',
        link_color: '#3390ec',
        button_color: '#3390ec',
        button_text_color: '#ffffff'
      })
      setViewportHeight(window.innerHeight)
      setIsReady(true)
    }
  }, [])

  const showAlert = (message) => {
    if (webApp) {
      webApp.showAlert(message)
    } else {
      alert(message)
    }
  }

  const showConfirm = (message, callback) => {
    if (webApp) {
      webApp.showConfirm(message, callback)
    } else {
      const result = confirm(message)
      callback(result)
    }
  }

  const showPopup = (params) => {
    if (webApp && webApp.showPopup) {
      webApp.showPopup(params)
    } else {
      alert(params.message || params.title)
    }
  }

  const showScanQrPopup = (params, callback) => {
    if (webApp && webApp.showScanQrPopup) {
      webApp.showScanQrPopup(params, callback)
    } else {
      // Fallback для тестирования
      setTimeout(() => callback('mock_qr_data'), 1000)
    }
  }

  const hapticFeedback = (type = 'impact', style = 'medium') => {
    if (webApp?.HapticFeedback) {
      if (type === 'impact') {
        webApp.HapticFeedback.impactOccurred(style)
      } else if (type === 'notification') {
        webApp.HapticFeedback.notificationOccurred(style)
      } else if (type === 'selection') {
        webApp.HapticFeedback.selectionChanged()
      }
    }
  }

  const setMainButton = (text, show = true, callback = null) => {
    if (webApp?.MainButton) {
      webApp.MainButton.setText(text)
      
      if (callback) {
        // Удаляем предыдущий обработчик
        webApp.offEvent('mainButtonClicked')
        webApp.onEvent('mainButtonClicked', callback)
      }
      
      if (show) {
        webApp.MainButton.show()
      } else {
        webApp.MainButton.hide()
      }
    }
  }

  const setBackButton = (show = true, callback = null) => {
    if (webApp?.BackButton) {
      if (callback) {
        // Удаляем предыдущий обработчик
        webApp.offEvent('backButtonClicked')
        webApp.onEvent('backButtonClicked', callback)
      }
      
      if (show) {
        webApp.BackButton.show()
      } else {
        webApp.BackButton.hide()
      }
    }
  }

  const setSettingsButton = (show = true, callback = null) => {
    if (webApp?.SettingsButton) {
      if (callback) {
        webApp.offEvent('settingsButtonClicked')
        webApp.onEvent('settingsButtonClicked', callback)
      }
      
      if (show) {
        webApp.SettingsButton.show()
      } else {
        webApp.SettingsButton.hide()
      }
    }
  }

  const sendData = (data) => {
    if (webApp) {
      webApp.sendData(JSON.stringify(data))
    } else {
      console.log('Отправка данных в Telegram:', data)
    }
  }

  const openLink = (url, options = {}) => {
    if (webApp) {
      webApp.openLink(url, options)
    } else {
      window.open(url, '_blank')
    }
  }

  const openTelegramLink = (url) => {
    if (webApp) {
      webApp.openTelegramLink(url)
    } else {
      window.open(url, '_blank')
    }
  }

  const openInvoice = (url, callback) => {
    if (webApp && webApp.openInvoice) {
      webApp.openInvoice(url, callback)
    } else {
      // Fallback
      openLink(url)
      if (callback) callback({ status: 'paid' })
    }
  }

  const requestWriteAccess = (callback) => {
    if (webApp && webApp.requestWriteAccess) {
      webApp.requestWriteAccess(callback)
    } else {
      callback(true)
    }
  }

  const requestContact = (callback) => {
    if (webApp && webApp.requestContact) {
      webApp.requestContact(callback)
    } else {
      callback({
        contact: {
          phone_number: '+7999123456',
          first_name: 'Иван',
          last_name: 'Операторов'
        }
      })
    }
  }

  const switchInlineQuery = (query, choose_chat_types = []) => {
    if (webApp && webApp.switchInlineQuery) {
      webApp.switchInlineQuery(query, choose_chat_types)
    } else {
      console.log('Switch inline query:', query, choose_chat_types)
    }
  }

  const readTextFromClipboard = (callback) => {
    if (webApp && webApp.readTextFromClipboard) {
      webApp.readTextFromClipboard(callback)
    } else {
      // Fallback для браузера
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(callback).catch(() => callback(''))
      } else {
        callback('')
      }
    }
  }

  const requestFullscreen = () => {
    if (webApp && webApp.requestFullscreen) {
      webApp.requestFullscreen()
    }
  }

  const exitFullscreen = () => {
    if (webApp && webApp.exitFullscreen) {
      webApp.exitFullscreen()
    }
  }

  const lockOrientation = () => {
    if (webApp && webApp.lockOrientation) {
      webApp.lockOrientation()
    }
  }

  const unlockOrientation = () => {
    if (webApp && webApp.unlockOrientation) {
      webApp.unlockOrientation()
    }
  }

  const isVersionAtLeast = (version) => {
    if (webApp && webApp.isVersionAtLeast) {
      return webApp.isVersionAtLeast(version)
    }
    return false
  }

  const platform = webApp?.platform || 'unknown'
  const version = webApp?.version || '1.0'
  const colorScheme = webApp?.colorScheme || 'dark'

  return {
    webApp,
    user,
    isReady,
    themeParams,
    viewportHeight,
    platform,
    version,
    colorScheme,
    startParam,
    showAlert,
    showConfirm,
    showPopup,
    showScanQrPopup,
    hapticFeedback,
    setMainButton,
    setBackButton,
    setSettingsButton,
    sendData,
    openLink,
    openTelegramLink,
    openInvoice,
    requestWriteAccess,
    requestContact,
    switchInlineQuery,
    readTextFromClipboard,
    requestFullscreen,
    exitFullscreen,
    lockOrientation,
    unlockOrientation,
    isVersionAtLeast
  }
}