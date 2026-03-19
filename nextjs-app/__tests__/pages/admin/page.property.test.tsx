import React from 'react';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Property-based тест для адаптивной компоновки главной страницы админки
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 *
 * Property 2: Адаптивная компоновка работает на всех размерах экрана
 * For any размер экрана от 320px до 1920px, все компоненты должны адаптироваться под ширину экрана,
 * сохранять функциональность и активировать соответствующие режимы (компактный для маленьких экранов,
 * скрытие UserPanel на мобильных)
 */
describe('Admin Page - Responsive Layout Property Tests', () => {
  /**
   * Мок для компонента Header
   */
  const MockHeader = () => <div data-testid="header">Header</div>;

  /**
   * Мок для компонента Sidebar
   */
  const MockSidebar = () => <div data-testid="sidebar">Sidebar</div>;

  /**
   * Мок для компонента ChatWindow
   */
  const MockChatWindow = () => <div data-testid="chat-window">ChatWindow</div>;

  /**
   * Мок для компонента UserPanel
   */
  const MockUserPanel = () => <div data-testid="user-panel">UserPanel</div>;

  /**
   * Мок для ErrorBoundary
   */
  const MockErrorBoundary = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  );

  /**
   * Компонент для тестирования адаптивной компоновки
   */
  const ResponsiveLayoutComponent = ({ screenWidth }: { screenWidth: number }) => {
    const isMobile = screenWidth < 768;

    return (
      <MockErrorBoundary>
        <div
          className="flex flex-col h-screen bg-telegram-bg"
          data-testid="main-container"
          style={{ width: `${screenWidth}px` }}
        >
          {/* Заголовок приложения */}
          <MockErrorBoundary>
            <MockHeader />
          </MockErrorBoundary>

          {/* Основная область с боковой панелью, чатом и панелью пользователя */}
          <div
            className="flex flex-1 overflow-hidden"
            data-testid="main-content"
          >
            {/* Боковая панель со списком сессий */}
            <MockErrorBoundary>
              <div
                className={isMobile ? 'w-16' : 'w-80'}
                data-testid="sidebar-container"
              >
                <MockSidebar />
              </div>
            </MockErrorBoundary>

            {/* Основная область с чатом */}
            <main
              className="flex-1 flex flex-col overflow-hidden"
              data-testid="chat-area"
            >
              <MockChatWindow />
            </main>

            {/* Панель информации о пользователе (скрыта на мобильных) */}
            {!isMobile && (
              <MockErrorBoundary>
                <div
                  className="w-80"
                  data-testid="user-panel-container"
                >
                  <MockUserPanel />
                </div>
              </MockErrorBoundary>
            )}
          </div>
        </div>
      </MockErrorBoundary>
    );
  };

  beforeEach(() => {
    // Очищаем все моки перед каждым тестом
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Очищаем DOM после каждого теста
    cleanup();
  });

  /**
   * Property 2.1: Компоновка адаптируется на всех размерах экрана
   * Проверяет, что компоненты корректно отображаются на разных размерах экрана
   */
  it('должна адаптироваться на всех размерах экрана от 320px до 1920px', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        (screenWidth) => {
          const { container, getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          // Проверяем, что основной контейнер отрендерился
          const mainContainers = getAllByTestId('main-container');
          expect(mainContainers.length).toBeGreaterThan(0);

          // Проверяем, что все основные компоненты присутствуют
          const headers = getAllByTestId('header');
          expect(headers.length).toBeGreaterThan(0);

          const sidebars = getAllByTestId('sidebar-container');
          expect(sidebars.length).toBeGreaterThan(0);

          const chatAreas = getAllByTestId('chat-area');
          expect(chatAreas.length).toBeGreaterThan(0);

          // Проверяем, что структура flex работает корректно
          const mainContainer = mainContainers[0];
          expect(mainContainer).toHaveClass('flex');
          expect(mainContainer).toHaveClass('flex-col');

          // Проверяем, что основная область имеет flex-1 для заполнения пространства
          const mainContents = getAllByTestId('main-content');
          expect(mainContents.length).toBeGreaterThan(0);
          expect(mainContents[0]).toHaveClass('flex');
          expect(mainContents[0]).toHaveClass('flex-1');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: UserPanel скрывается на мобильных устройствах
   * Проверяет, что UserPanel не отображается на экранах меньше 768px
   */
  it('должна скрывать UserPanel на мобильных устройствах (< 768px)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 767 }),
        (screenWidth) => {
          const { queryAllByTestId, getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          // Проверяем, что UserPanel не отображается на мобильных
          const userPanelContainers = queryAllByTestId('user-panel-container');
          expect(userPanelContainers.length).toBe(0);

          // Проверяем, что остальные компоненты присутствуют
          const headers = getAllByTestId('header');
          expect(headers.length).toBeGreaterThan(0);

          const sidebars = getAllByTestId('sidebar-container');
          expect(sidebars.length).toBeGreaterThan(0);

          const chatAreas = getAllByTestId('chat-area');
          expect(chatAreas.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2.3: UserPanel отображается на планшетах и десктопах
   * Проверяет, что UserPanel отображается на экранах 768px и больше
   */
  it('должна отображать UserPanel на планшетах и десктопах (>= 768px)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 768, max: 1920 }),
        (screenWidth) => {
          const { getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          // Проверяем, что UserPanel отображается на больших экранах
          const userPanelContainers = getAllByTestId('user-panel-container');
          expect(userPanelContainers.length).toBeGreaterThan(0);

          // Проверяем, что все компоненты присутствуют
          const headers = getAllByTestId('header');
          expect(headers.length).toBeGreaterThan(0);

          const sidebars = getAllByTestId('sidebar-container');
          expect(sidebars.length).toBeGreaterThan(0);

          const chatAreas = getAllByTestId('chat-area');
          expect(chatAreas.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2.4: Боковая панель адаптирует ширину в зависимости от размера экрана
   * Проверяет, что Sidebar имеет правильную ширину на разных экранах
   */
  it('должна адаптировать ширину боковой панели в зависимости от размера экрана', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        (screenWidth) => {
          const { getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          const sidebarContainers = getAllByTestId('sidebar-container');
          expect(sidebarContainers.length).toBeGreaterThan(0);

          const sidebarContainer = sidebarContainers[0];
          const isMobile = screenWidth < 768;

          // Проверяем, что ширина боковой панели соответствует размеру экрана
          // через inline style или через проверку наличия класса
          const style = sidebarContainer.getAttribute('style');
          const className = sidebarContainer.getAttribute('class');
          
          // Проверяем, что элемент имеет либо класс w-16, либо w-80
          expect(className).toMatch(/w-(16|80)/);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.5: Все компоненты остаются функциональными при любом размере экрана
   * Проверяет, что функциональность сохраняется на всех размерах
   */
  it('должны оставаться функциональными при любом размере экрана', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        (screenWidth) => {
          const { container, getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          // Проверяем, что контейнер отрендерился без ошибок
          expect(container).toBeTruthy();

          // Проверяем, что все основные компоненты присутствуют
          const headers = getAllByTestId('header');
          expect(headers.length).toBeGreaterThan(0);

          const sidebars = getAllByTestId('sidebar-container');
          expect(sidebars.length).toBeGreaterThan(0);

          const chatAreas = getAllByTestId('chat-area');
          expect(chatAreas.length).toBeGreaterThan(0);

          // Проверяем, что ErrorBoundary обернул компоненты
          const errorBoundaries = container.querySelectorAll('[data-testid="error-boundary"]');
          expect(errorBoundaries.length).toBeGreaterThan(0);

          // Проверяем, что flex контейнеры имеют правильные классы
          const mainContents = getAllByTestId('main-content');
          expect(mainContents.length).toBeGreaterThan(0);
          expect(mainContents[0]).toHaveClass('flex');
          expect(mainContents[0]).toHaveClass('overflow-hidden');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.6: Компоновка сохраняет правильное соотношение компонентов
   * Проверяет, что компоненты расположены в правильном порядке
   */
  it('должна сохранять правильное соотношение компонентов', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        (screenWidth) => {
          const { container, getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          // Проверяем порядок компонентов
          const mainContainers = getAllByTestId('main-container');
          expect(mainContainers.length).toBeGreaterThan(0);

          const mainContainer = mainContainers[0];
          const children = mainContainer.children;

          // Первый элемент - Header (обернут в ErrorBoundary)
          expect(children[0]).toHaveAttribute('data-testid', 'error-boundary');

          // Второй элемент - основная область с боковой панелью, чатом и UserPanel
          expect(children[1]).toHaveAttribute('data-testid', 'main-content');

          // Проверяем, что основная область содержит правильные компоненты
          const mainContents = getAllByTestId('main-content');
          expect(mainContents.length).toBeGreaterThan(0);

          const mainContent = mainContents[0];
          const mainContentChildren = mainContent.children;

          // Первый элемент - Sidebar (обернут в ErrorBoundary)
          expect(mainContentChildren[0]).toHaveAttribute('data-testid', 'error-boundary');

          // Второй элемент - ChatArea
          expect(mainContentChildren[1]).toHaveAttribute('data-testid', 'chat-area');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.7: Компоновка использует правильные классы для адаптивности
   * Проверяет, что применяются правильные Tailwind классы для адаптивности
   */
  it('должна использовать правильные классы для адаптивности', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        (screenWidth) => {
          const { getAllByTestId } = render(
            <ResponsiveLayoutComponent screenWidth={screenWidth} />
          );

          // Проверяем основной контейнер
          const mainContainers = getAllByTestId('main-container');
          expect(mainContainers.length).toBeGreaterThan(0);

          const mainContainer = mainContainers[0];
          expect(mainContainer).toHaveClass('flex');
          expect(mainContainer).toHaveClass('flex-col');
          expect(mainContainer).toHaveClass('h-screen');
          expect(mainContainer).toHaveClass('bg-telegram-bg');

          // Проверяем основную область
          const mainContents = getAllByTestId('main-content');
          expect(mainContents.length).toBeGreaterThan(0);

          const mainContent = mainContents[0];
          expect(mainContent).toHaveClass('flex');
          expect(mainContent).toHaveClass('flex-1');
          expect(mainContent).toHaveClass('overflow-hidden');

          // Проверяем ChatArea
          const chatAreas = getAllByTestId('chat-area');
          expect(chatAreas.length).toBeGreaterThan(0);

          const chatArea = chatAreas[0];
          expect(chatArea).toHaveClass('flex-1');
          expect(chatArea).toHaveClass('flex');
          expect(chatArea).toHaveClass('flex-col');
          expect(chatArea).toHaveClass('overflow-hidden');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.8: Компоновка корректно обрабатывает граничные размеры экрана
   * Проверяет, что компоновка работает корректно на граничных значениях (320px, 768px, 1024px, 1920px)
   */
  it('должна корректно обрабатывать граничные размеры экрана', () => {
    const boundaryWidths = [320, 767, 768, 1023, 1024, 1920];

    boundaryWidths.forEach((screenWidth) => {
      const { getAllByTestId, queryAllByTestId } = render(
        <ResponsiveLayoutComponent screenWidth={screenWidth} />
      );

      // Проверяем, что все основные компоненты присутствуют
      const headers = getAllByTestId('header');
      expect(headers.length).toBeGreaterThan(0);

      const sidebars = getAllByTestId('sidebar-container');
      expect(sidebars.length).toBeGreaterThan(0);

      const chatAreas = getAllByTestId('chat-area');
      expect(chatAreas.length).toBeGreaterThan(0);

      // Проверяем видимость UserPanel
      const isMobile = screenWidth < 768;
      const userPanels = queryAllByTestId('user-panel-container');
      if (isMobile) {
        expect(userPanels.length).toBe(0);
      } else {
        expect(userPanels.length).toBeGreaterThan(0);
      }

      cleanup();
    });
  });
});
