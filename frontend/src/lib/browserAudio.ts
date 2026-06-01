export function playBeep(frequency = 880, type: OscillatorType = "sine", gainValue = 0.05, durationSeconds = 0.16) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.frequency.value = frequency;
  oscillator.type = type;
  gain.gain.value = gainValue;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + durationSeconds);
}
