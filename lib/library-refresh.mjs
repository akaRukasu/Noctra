export function libraryRefreshState(task, monitor, now = Date.now()) {
  let requested = Number(monitor.requestedAt || 0);
  const state = String(task?.State || 'Unknown');
  const running = /^(running|cancelling)$/i.test(state);
  const end = Date.parse(task?.LastExecutionResult?.EndTimeUtc || '') || 0;
  if (running && !monitor.wasRunning) {
    monitor.baselineEnd = end;
    if (!requested || monitor.finishedAt) requested = monitor.requestedAt = now;
  }
  monitor.wasRunning = running;
  const newResult = end > Number(monitor.baselineEnd || 0) && (!requested || end >= requested - 1000);
  let phase = 'idle';
  if (running) {
    monitor.observedRunning = true;
    monitor.finishedAt = 0;
    phase = 'running';
  } else if (newResult && (requested || monitor.observedRunning)) {
    monitor.finishedAt ||= now;
    phase = /^(completed|success)$/i.test(task.LastExecutionResult.Status) ? 'complete' : 'error';
  } else if (requested || monitor.observedRunning) {
    phase = now - (requested || now) < 60000 ? 'starting' : 'error';
  }
  const raw = Number(task?.CurrentProgressPercentage);
  const progress = phase === 'complete' ? 100 : (running && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0);
  const message = phase === 'running' ? `Analyse des médiathèques · ${progress} %`
    : phase === 'starting' ? 'En attente de confirmation de Jellyfin…'
      : phase === 'complete' ? 'Médiathèques actualisées · 100 %'
        : phase === 'error' ? (newResult ? 'Jellyfin signale une analyse interrompue ou en erreur.' : monitor.observedRunning ? 'Jellyfin n’a pas confirmé la fin de l’analyse.' : 'Jellyfin n’a pas confirmé le démarrage de l’analyse.')
          : 'Analyse des médiathèques en attente.';
  return { running, phase, progress, message, state, taskId: task?.Id || null, lastExecution: task?.LastExecutionResult || null };
}
