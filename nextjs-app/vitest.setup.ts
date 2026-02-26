import '@testing-library/jest-dom'

// Устанавливаем переменные окружения для тестов
process.env.ADMIN_USERNAME = 'testadmin';
process.env.ADMIN_PASSWORD = 'testpassword123';
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing';
process.env.BOT_TOKEN = 'test-bot-token';
