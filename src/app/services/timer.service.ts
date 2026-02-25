import { Injectable, signal, computed } from '@angular/core';

export type TimerState = 'idle' | 'running' | 'paused' | 'done';

const DEFAULT_MINUTES = 50;

@Injectable({ providedIn: 'root' })
export class TimerService {
  private _durationMinutes = signal(DEFAULT_MINUTES);
  private _secondsLeft     = signal(DEFAULT_MINUTES * 60);
  private _state           = signal<TimerState>('idle');
  private _interval: ReturnType<typeof setInterval> | null = null;

  readonly state           = this._state.asReadonly();
  readonly secondsLeft     = this._secondsLeft.asReadonly();
  readonly durationMinutes = this._durationMinutes.asReadonly();

  readonly totalSeconds = computed(() => this._durationMinutes() * 60);

  readonly minutes = computed(() => Math.floor(this._secondsLeft() / 60));
  readonly seconds = computed(() => this._secondsLeft() % 60);

  readonly progress = computed(() => {
    const total = this.totalSeconds();
    if (total === 0) return 0;
    return (total - this._secondsLeft()) / total;
  });

  readonly displayTime = computed(() => {
    const m = this.minutes().toString().padStart(2, '0');
    const s = this.seconds().toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  setDuration(minutes: number) {
    const clamped = Math.max(1, Math.min(180, minutes));
    this._durationMinutes.set(clamped);
    this._secondsLeft.set(clamped * 60);
    this._state.set('idle');
    this.clearInterval();
  }

  start() {
    if (this._state() === 'done') return;
    this._state.set('running');
    this._interval = setInterval(() => {
      const next = this._secondsLeft() - 1;
      if (next <= 0) {
        this._secondsLeft.set(0);
        this._state.set('done');
        this.clearInterval();
      } else {
        this._secondsLeft.set(next);
      }
    }, 1000);
  }

  pause() {
    if (this._state() !== 'running') return;
    this._state.set('paused');
    this.clearInterval();
  }

  reset() {
    this.clearInterval();
    this._secondsLeft.set(this._durationMinutes() * 60);
    this._state.set('idle');
  }

  private clearInterval() {
    if (this._interval !== null) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}
