/**
 * Компонент для динамического рендеринга медиа-контента
 * Поддерживает все типы медиа: photo, video, animation, sticker, voice, document, text
 */

'use client';

import React from 'react';
import { MediaType } from '@/types/support';

export interface MediaRendererProps {
  mediaType: MediaType;
  filePath?: string;
  caption?: string;
  messageText: string;
}

export function MediaRenderer({
  mediaType,
  filePath,
  caption,
  messageText,
}: MediaRendererProps): React.JSX.Element {
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

  // Рендеринг фото
  if (mediaType === 'photo') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>📷 Фото недоступно</span>
        </div>
      );
    }

    return (
      <div className="media-container">
        <img
          src={`/api/media/${filePath}`}
          alt={caption || 'Фото'}
          onError={handleImageError}
          className="media-image"
        />
        {caption && <p className="media-caption">{caption}</p>}
      </div>
    );
  }

  // Рендеринг видео
  if (mediaType === 'video') {
    if (!filePath) {
      return (
        <div className="media-placeholder">
          <span>🎥 Видео недоступно</span>
        </div>
      );
    }

    return (
      <div className="media-container">
        <video
          src={`/api/media/${filePath}`}
          controls
          onError={handleVideoError}
          className="media-video"
        >
          Ваш браузер не поддерживает воспроизведение видео.
        </video>
        {caption && <p className="media-caption">{caption}</p>}
      </div>
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
