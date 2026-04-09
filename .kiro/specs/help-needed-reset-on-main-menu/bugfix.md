# Bugfix Requirements Document

## Introduction

Данный документ описывает баг с индикатором "Нужна помощь" в админ-панели. Когда пользователь нажимает кнопку "Нужна помощь", у администраторов в панели счётчик уведомлений становится зелёным (help_needed=True). Однако когда администратор вызывает у пользователя "Вернуть в главное меню" (reset-state), счётчик должен снова стать красным (help_needed=False), но этого не происходит.

Из логов видно, что при вызове reset-state выполняется сброс FSM состояния и отправка команды /start, но нигде не происходит сброс флага help_needed в базе данных.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN администратор нажимает "Вернуть в главное меню" для пользователя с help_needed=True THEN флаг help_needed остаётся True в базе данных

1.2 WHEN администратор нажимает "Вернуть в главное меню" для пользователя с help_needed=True THEN счётчик в админ-панели остаётся зелёным вместо того чтобы стать красным

1.3 WHEN выполняется метод StateResetService.reset_user_state() THEN метод не вызывает сброс флага help_needed для активной сессии пользователя

### Expected Behavior (Correct)

2.1 WHEN администратор нажимает "Вернуть в главное меню" для пользователя с help_needed=True THEN флаг help_needed SHALL быть сброшен в False в базе данных

2.2 WHEN администратор нажимает "Вернуть в главное меню" для пользователя с help_needed=True THEN счётчик в админ-панели SHALL стать красным (help_needed=False)

2.3 WHEN выполняется метод StateResetService.reset_user_state() THEN метод SHALL вызвать сброс флага help_needed для активной сессии пользователя через session.reset_help_needed()

### Unchanged Behavior (Regression Prevention)

3.1 WHEN администратор нажимает "Вернуть в главное меню" для пользователя с help_needed=False THEN флаг help_needed SHALL CONTINUE TO оставаться False

3.2 WHEN выполняется метод StateResetService.reset_user_state() THEN метод SHALL CONTINUE TO очищать FSM состояние пользователя

3.3 WHEN выполняется метод StateResetService.reset_user_state() THEN метод SHALL CONTINUE TO сохранять команду /start в историю сообщений

3.4 WHEN выполняется метод StateResetService.reset_user_state() THEN метод SHALL CONTINUE TO программно вызывать обработчик команды /start

3.5 WHEN пользователь нажимает кнопку "Нужна помощь" THEN флаг help_needed SHALL CONTINUE TO устанавливаться в True

3.6 WHEN администратор закрывает сессию через админ-панель THEN флаг help_needed SHALL CONTINUE TO оставаться неизменным (не сбрасываться автоматически)
