/**
 * Перечисление ролей администраторов
 * Определяет иерархию доступа в системе
 */

export enum AdminRole {
  /** Разработчик - полный доступ к системе */
  DEVELOPER = 0,
  
  /** Помощник - доступ эквивалентный разработчику */
  ASSISTANT = 1,
  
  /** Администратор - право назначать операторов */
  ADMINISTRATOR = 2,
  
  /** Оператор - базовый уровень доступа */
  OPERATOR = 3,
}

/**
 * Получает русское название роли
 * @param role - Числовое значение роли
 * @returns Название роли на русском языке
 */
export function getRoleName(role: AdminRole): string {
  switch (role) {
    case AdminRole.DEVELOPER:
      return 'Разработчик';
    case AdminRole.ASSISTANT:
      return 'Помощник';
    case AdminRole.ADMINISTRATOR:
      return 'Администратор';
    case AdminRole.OPERATOR:
      return 'Оператор';
    default:
      return 'Неизвестная роль';
  }
}

/**
 * Проверяет, может ли роль назначать операторов
 * @param role - Числовое значение роли
 * @returns true если роль <= 2 (Developer, Assistant, Administrator)
 */
export function canAssignOperators(role: AdminRole): boolean {
  return role <= AdminRole.ADMINISTRATOR;
}

/**
 * Проверяет, может ли роль изменять конфигурацию системы
 * @param role - Числовое значение роли
 * @returns true если роль <= 1 (Developer, Assistant)
 */
export function canModifyConfig(role: AdminRole): boolean {
  return role <= AdminRole.ASSISTANT;
}

/**
 * Проверяет, может ли роль отвечать пользователям
 * @param role - Числовое значение роли
 * @returns true для всех ролей (0-3)
 */
export function canRespondToUsers(role: AdminRole): boolean {
  return role >= AdminRole.DEVELOPER && role <= AdminRole.OPERATOR;
}
