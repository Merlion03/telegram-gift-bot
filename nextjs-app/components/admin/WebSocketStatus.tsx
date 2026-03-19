/**
 * Компонент для отображения статуса WebSocket соединения
 * Помогает диагностировать проблемы с real-time подключением
 */

'use client';

import { useEffect, useState } from 'react';
import { getRealtimeClient } from '@/lib/database/realtimeClient';

export function WebSocketStatus() {
  const [status, setStatus] = useState<string>('disconnected');
  const [clientId, setClientId] = useState<string | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    const client = getRealtimeClient();
    
    // Обновляем статус каждые 2 секунды
    const updateStatus = () => {
      const currentStatus = client.getConnectionState();
      const currentClientId = client.getClientId();
      const currentSubscriptions = client.getSubscriptionCount();
      
      setStatus(currentStatus);
      setClientId(currentClientId);
      setSubscriptionCount(currentSubscriptions);
      setLastUpdate(new Date().toLocaleTimeString('ru-RU'));
    };

    // Первое обновление
    updateStatus();
    
    // Периодические обновления
    const interval = setInterval(updateStatus, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'reconnecting': return 'text-orange-600';
      case 'disconnected': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'reconnecting': return '🟠';
      case 'disconnected': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="bg-white border rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-gray-900">WebSocket Status</h3>
        <span className="text-xs text-gray-500">Обновлено: {lastUpdate}</span>
      </div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span>{getStatusIcon(status)}</span>
          <span className={`font-medium ${getStatusColor(status)}`}>
            {status}
          </span>
        </div>
        
        {clientId && (
          <div className="text-xs text-gray-600">
            Client ID: {clientId}
          </div>
        )}
        
        <div className="text-xs text-gray-600">
          Подписок: {subscriptionCount}
        </div>
      </div>
    </div>
  );
}