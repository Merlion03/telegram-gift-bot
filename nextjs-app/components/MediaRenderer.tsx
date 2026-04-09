/**
 * Компонент для динамического рендеринга медиа-контента
 * Поддерживает все типы медиа: photo, video, animation, sticker, voice, document, text
 * Включает превью для изображений и видео с модальным окном для полноразмерного просмотра
 */

'use client';

import React, { useState } from 'react';
import { MediaType } from '@/types/support';
import { X, Download, ZoomIn } from 'lucide-react';

export interface MediaRendererProps {
  mediaType: MediaType;
  filePath?: string;
  caption?: string;
  messageText: string;
}

/**
 * Модальное окно для полноразмерного просмотра медиа
 */
function MediaModal({ 
  isOpen, 
  onClose, 
  mediaType, 
  filePath, 
  caption 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  mediaType: MediaType; 
  filePath: string; 
  caption?: string;
}) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
      }}
      onClick={onClose}
    >
      <style jsx>{`
        .modal-content {
          max-width: 90vw;
          max-height: 90vh;
          object-fit: contain;
        }
        
        .modal-controls {
          position: fixed;
          top: 1rem;
          right: 1rem;
          display: flex;
          gap: 0.5rem;
          z-index: 60;
        }
        
        .modal-button {
          background-color: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
          color: white;
        }
        
        .modal-button:hover {
          background-color: rgba(255, 255, 255, 0.2);
        }
        
        .modal-caption {
          position: fixed;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(10px);
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          max-width: 80vw;
          text-align: center;
        }
      `}</style>
      
      {/* Кнопки управления */}
      <div className="modal-controls">
        <a
          href={`/api/media/${filePath}`}
          download
          className="modal-button"
          onClick={(e) => e.stopPropagation()}
          title="Скачать"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          onClick={onClose}
          className="modal-button"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Контент */}
      <div onClick={(e) => e.stopPropagation()}>
        {mediaType === 'photo' && (
          <img
            src={`/api/media/${filePath}`}
            alt={caption || 'Фото'}
            className="modal-content"
          />
        )}
        
        {mediaType === 'video' && (
          <video
            src={`/api/media/${filePath}`}
            controls
            autoPlay
            className="modal-content"
          >
            Ваш браузер не поддерживает воспроизведение видео.
          </video>
        )}
      </div>

      {/* Подпись */}
      {caption && (
        <div className="modal-caption">
          {caption}
        </div>
      )}
    </div>
  );
}

export function MediaRenderer({
  mediaType,
  filePath,
  caption,
  messageText,
}: MediaRendererProps): React.JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Обработчик ошибок загрузки изображений
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('Ошибка загрузки медиа:', filePath);
    e.currentTarget.src = '/placeholder-image.png';
    e.currentTarget.alt = 'Файл недоступен';
  };

  // Обработчик ошибок загрузки видео
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error('Ошибка загрузки видео:', filePath);
  };

  // Обработчик ошибок загрузки аудио
  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    console.error('Ошибка загрузки аудио:', filePath);
  };

  // Рендеринг фото с превью
  if (mediaType === 'photo') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>📷 Фото недоступно</span>
        </div>
      );
    }

    return (
      <>
        <div className="media-container">
          <div 
            className="media-preview-wrapper"
            onClick={() => setIsModalOpen(true)}
          >
            <img
              src={`/api/media/${filePath}`}
              alt={caption || 'Фото'}
              onError={handleImageError}
              className="media-image-preview"
            />
            <div className="media-overlay">
              <ZoomIn className="w-6 h-6 text-white" />
            </div>
          </div>
          {caption && <p className="media-caption">{caption}</p>}
        </div>
        
        <MediaModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          mediaType={mediaType}
          filePath={filePath}
          caption={caption}
        />
      </>
    );
  }

  // Рендеринг видео с превью
  if (mediaType === 'video') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>🎥 Видео недоступно</span>
        </div>
      );
    }

    return (
      <>
        <div className="media-container">
          <div 
            className="media-preview-wrapper"
            onClick={() => setIsModalOpen(true)}
          >
            <video
              src={`/api/media/${filePath}`}
              onError={handleVideoError}
              className="media-video-preview"
              muted
            >
              Ваш браузер не поддерживает воспроизведение видео.
            </video>
            <div className="media-overlay">
              <ZoomIn className="w-6 h-6 text-white" />
            </div>
          </div>
          {caption && <p className="media-caption">{caption}</p>}
        </div>
        
        <MediaModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          mediaType={mediaType}
          filePath={filePath}
          caption={caption}
        />
      </>
    );
  }

  // Рендеринг анимации (GIF/MP4)
  if (mediaType === 'animation') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>🎬 Анимация недоступна</span>
        </div>
      );
    }

    return (
      <div className="media-container">
        <video
          src={`/api/media/${filePath}`}
          autoPlay
          loop
          muted
          onError={handleVideoError}
          className="media-animation"
        >
          Ваш браузер не поддерживает воспроизведение анимации.
        </video>
        {caption && <p className="media-caption">{caption}</p>}
      </div>
    );
  }

  // Рендеринг стикера
  if (mediaType === 'sticker') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>🎭 Стикер недоступен</span>
        </div>
      );
    }

    // Определяем формат стикера по расширению
    const isVideoSticker = filePath.endsWith('.webm');

    if (isVideoSticker) {
      return (
        <div className="media-container">
          <video
            src={`/api/media/${filePath}`}
            autoPlay
            loop
            muted
            onError={handleVideoError}
            className="media-sticker"
          >
            Ваш браузер не поддерживает воспроизведение стикера.
          </video>
        </div>
      );
    }

    return (
      <div className="media-container">
        <img
          src={`/api/media/${filePath}`}
          alt="Стикер"
          onError={handleImageError}
          className="media-sticker"
        />
      </div>
    );
  }

  // Рендеринг голосового сообщения
  if (mediaType === 'voice') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>🎤 Голосовое сообщение недоступно</span>
        </div>
      );
    }

    return (
      <div className="media-container">
        <audio
          src={`/api/media/${filePath}`}
          controls
          onError={handleAudioError}
          className="media-audio"
        >
          Ваш браузер не поддерживает воспроизведение аудио.
        </audio>
        {caption && <p className="media-caption">{caption}</p>}
      </div>
    );
  }

  // Рендеринг документа
  if (mediaType === 'document') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>📎 Документ недоступен</span>
        </div>
      );
    }

    return (
      <div className="media-container">
        <a
          href={`/api/media/${filePath}`}
          download
          className="media-document-link"
        >
          📎 Скачать файл
        </a>
        {caption && <p className="media-caption">{caption}</p>}
      </div>
    );
  }

  // Рендеринг текстового сообщения (по умолчанию)
  return <p className="media-text">{messageText}</p>;
}
