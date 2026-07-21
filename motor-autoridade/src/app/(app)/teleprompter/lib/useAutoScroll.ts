"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseAutoScroll = {
  /** Ref a ser aplicada ao contêiner rolável do roteiro. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrolling: boolean;
  atEnd: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
};

/**
 * Rolagem automática do roteiro com `requestAnimationFrame`.
 *
 * A velocidade é em pixels por segundo e é lida de um ref, de modo que ajustar
 * o slider durante a rolagem tem efeito imediato sem reiniciar o loop. O
 * acúmulo é subpixel (guardado em `offsetRef`) para que velocidades baixas
 * ainda avancem suavemente em vez de travar por arredondamento.
 */
export function useAutoScroll(speedPxPerSec: number): UseAutoScroll {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const speedRef = useRef(speedPxPerSec);

  useEffect(() => {
    speedRef.current = speedPxPerSec;
  }, [speedPxPerSec]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  const pause = useCallback(() => {
    stopLoop();
    setScrolling(false);
  }, [stopLoop]);

  const play = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Já no fim: nada a rolar.
    if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
      setAtEnd(true);
      return;
    }
    setAtEnd(false);
    offsetRef.current = el.scrollTop;
    setScrolling(true);

    const step = (ts: number) => {
      const node = containerRef.current;
      if (!node) {
        stopLoop();
        setScrolling(false);
        return;
      }
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      offsetRef.current += speedRef.current * dt;
      node.scrollTop = offsetRef.current;

      const maxScroll = node.scrollHeight - node.clientHeight;
      if (node.scrollTop >= maxScroll - 1) {
        stopLoop();
        setScrolling(false);
        setAtEnd(true);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [stopLoop]);

  const toggle = useCallback(() => {
    if (scrolling) pause();
    else play();
  }, [scrolling, pause, play]);

  const reset = useCallback(() => {
    stopLoop();
    setScrolling(false);
    setAtEnd(false);
    offsetRef.current = 0;
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  return { containerRef, scrolling, atEnd, play, pause, toggle, reset };
}
