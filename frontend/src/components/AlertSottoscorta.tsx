import React from 'react';

type PartAlert = {
  id: string;
  name: string;
  codice?: string;
  quantita: number;
  scorta_minima: number;
  giacenza_negativa: boolean;
  sotto_scorta: boolean;
};

interface Props {
  pezzi: PartAlert[];
  onDismiss: () => void;
}

export default function AlertSottoscorta({ pezzi, onDismiss }: Props) {
  if (!pezzi.length) return null;

  return (
    <div className="alert-sottoscorta">
      <div className="alert-header">
        <strong>⚠ Attenzione: i seguenti ricambi sono sotto scorta:</strong>
        <button className="dismiss" onClick={onDismiss}>×</button>
      </div>
      <ul>
        {pezzi.map((p) => (
          <li key={p.id}>
            {p.name}{p.codice ? ` (${p.codice})` : ''} —{' '}
            Giacenza: <strong>{p.quantita}</strong>
            {p.sotto_scorta && !p.giacenza_negativa && ` / Scorta min: ${p.scorta_minima}`}
          </li>
        ))}
      </ul>
      <a href="#/magazzino/ricambi" className="link-magazzino">Vai al magazzino →</a>
    </div>
  );
}
