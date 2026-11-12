// src/hooks/useAudioRecorder.js
// Hook compartido para previsualización/reproducción de audio y grabación MediaRecorder
// Reutilizado por FarmSatelliteMap, ChatIA y SectionChatIA.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  stopMediaStream,
  acquireScreenWakeLock,
  releaseScreenWakeLock,
} from './useVoiceGeoTracker';

export function formatAudioTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Maneja el estado de audio pendiente y su reproductor de preview estilo WhatsApp.
 */
export function useAudioPreview() {
  const [pendingAudio, setPendingAudioState] = useState(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef(null);

  const setPendingAudio = useCallback((nextAudio) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewDuration(nextAudio?.duration || 0);
    setPendingAudioState(nextAudio);
  }, []);

  const togglePlayPreview = useCallback(() => {
    const audioEl = previewAudioRef.current;
    if (!audioEl) return;
    if (isPreviewPlaying) {
      audioEl.pause();
      setIsPreviewPlaying(false);
    } else {
      audioEl
        .play()
        .then(() => setIsPreviewPlaying(true))
        .catch((err) => {
          console.error('Error reproduciendo preview audio:', err);
        });
    }
  }, [isPreviewPlaying]);

  const handleSeekPreview = useCallback((e) => {
    const time = parseFloat(e.target.value);
    setPreviewCurrentTime(time);
    if (previewAudioRef.current) {
      previewAudioRef.current.currentTime = time;
    }
  }, []);

  const handleDiscardAudio = useCallback(() => {
    setPendingAudio(null);
  }, [setPendingAudio]);

  return {
    pendingAudio,
    setPendingAudio,
    isPreviewPlaying,
    setIsPreviewPlaying,
    previewCurrentTime,
    setPreviewCurrentTime,
    previewDuration,
    setPreviewDuration,
    previewAudioRef,
    togglePlayPreview,
    handleSeekPreview,
    handleDiscardAudio,
  };
}

/**
 * Hook completo de grabación MediaRecorder (sin GPS) + preview de audio para SectionChatIA.
 */
export function useAudioRecorder({ onError } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const preview = useAudioPreview();
  const { setPendingAudio } = preview;

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const timerRef = useRef(null);
  const wakeLockRef = useRef(null);
  const cancelNextStopRef = useRef(false);
  const durationRef = useRef(0);

  const cleanupStreams = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
    }
    if (wakeLockRef.current) {
      releaseScreenWakeLock(wakeLockRef.current);
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => cleanupStreams, [cleanupStreams]);

  const startRecording = useCallback(async () => {
    try {
      setPendingAudio(null);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Tu navegador no soporta grabación de audio.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      try {
        wakeLockRef.current = await acquireScreenWakeLock();
      } catch {
        // WakeLock opcional
      }

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
          else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
          else mimeType = '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      cancelNextStopRef.current = false;
      durationRef.current = 0;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        cleanupStreams();
        setIsRecording(false);
        if (cancelNextStopRef.current) {
          cancelNextStopRef.current = false;
          return;
        }
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        if (blob.size < 200) return;

        const duration = Math.max(1, durationRef.current || 1);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPendingAudio({
            blob,
            dataUrl: reader.result,
            mimeType: finalMime,
            duration,
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      cleanupStreams();
      setIsRecording(false);
      if (onError) onError(err);
    }
  }, [cleanupStreams, onError, setPendingAudio]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        cleanupStreams();
        setIsRecording(false);
      }
    } catch (err) {
      cleanupStreams();
      setIsRecording(false);
      if (onError) onError(err);
    }
  }, [cleanupStreams, onError]);

  const cancelRecording = useCallback(() => {
    cancelNextStopRef.current = true;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        cleanupStreams();
        setIsRecording(false);
      }
    } catch {
      cleanupStreams();
      setIsRecording(false);
    }
    setPendingAudio(null);
  }, [cleanupStreams, setPendingAudio]);

  return {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    cancelRecording,
    ...preview,
  };
}

