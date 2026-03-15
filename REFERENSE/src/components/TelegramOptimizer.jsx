import { useEffect } from 'react'
import { useTelegramWebApp } from '../hooks/useTelegramWebApp'

const TelegramOptimizer = ({ children }) => {
  const { webApp, isReady, themeParams, viewportHeight } = useTelegramWebApp()

  useEffect(() => {
    if (isReady && webApp) {
      // Расширяем WebApp на весь экран
      webApp.expand()
      
      // Отключаем вертикальные свайпы для лучшего UX
      webApp.disableVerticalSwipes()
      
      // Настраиваем цвета под тему Telegram
      if (themeParams) {
        const root = document.documentElement
        root.style.setProperty('--tg-bg-color', themeParams.bg_color || '#ffffff')
        root.style.setProperty('--tg-text-color', themeParams.text_color || '#000000')
        root.style.setProperty('--tg-hint-color', themeParams.hint_color || '#999999')
        root.style.setProperty('--tg-link-color', themeParams.link_color || '#2481cc')
        root.style.setProperty('--tg-button-color', themeParams.button_color || '#2481cc')
        root.style.setProperty('--tg-button-text-color', themeParams.button_text_color || '#ffffff')
        root.style.setProperty('--tg-secondary-bg-color', themeParams.secondary_bg_color || '#f1f1f1')
        
        // Устанавливаем цвет заголовка
        webApp.setHeaderColor(themeParams.secondary_bg_color || themeParams.bg_color || '#ffffff')
        
        // Устанавливаем цвет фона
        webApp.setBackgroundColor(themeParams.bg_color || '#ffffff')
      }
      
      // Адаптируем высоту под viewport
      if (viewportHeight) {
        document.documentElement.style.setProperty('--tg-viewport-height', `${viewportHeight}px`)
      }
      
      // Убираем системные отступы
      document.body.style.margin = '0'
      document.body.style.padding = '0'
      document.body.style.overflow = 'hidden'
      
      // Добавляем класс для Telegram WebApp
      document.body.classList.add('telegram-webapp')
      
      // Предотвращаем зум
      const preventZoom = (e) => {
        if (e.touches.length > 1) {
          e.preventDefault()
        }
      }
      
      document.addEventListener('touchstart', preventZoom, { passive: false })
      
      return () => {
        document.removeEventListener('touchstart', preventZoom)
      }
    }
  }, [isReady, webApp, themeParams, viewportHeight])

  return children
}

export default TelegramOptimizer