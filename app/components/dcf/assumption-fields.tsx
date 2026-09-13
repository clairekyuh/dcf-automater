"use client";

import { useState } from "react";
import { DefinedTerm, type DefinedTermKey } from "@/app/components/dcf/defined-term";

type NumberFieldProps = {
  label: string;
  term?: DefinedTermKey;
  value: number;
  suffix: string;
  help: string;
  onChange: (value: number) => void;
};

export function NumberField({ label, term, value, suffix, help, onChange }: NumberFieldProps) {
  const [showHelp, setShowHelp] = useState(false);
  const displayValue = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  return <div className="number-field">
    <div className="field-label"><span>{term ? <DefinedTerm term={term}>{label}</DefinedTerm> : label}</span><button type="button" aria-label={`Explain ${label}`} aria-expanded={showHelp} onClick={() => setShowHelp((open) => !open)}>?</button></div>
    <div className="input-cell"><input aria-label={`${label} ${suffix}`} type="number" step="0.1" value={displayValue} onChange={(event) => onChange(Number(event.target.value))} /><b>{suffix}</b></div>
    {showHelp && <p className="field-help">{help}</p>}
  </div>;
}

type DateFieldProps = {
  value: string;
  help: string;
  onChange: (value: string) => void;
};

export function DateField({ value, help, onChange }: DateFieldProps) {
  const [showHelp, setShowHelp] = useState(false);
  return <div className="number-field">
    <div className="field-label"><span>Valuation date</span><button type="button" aria-label="Explain valuation date" aria-expanded={showHelp} onClick={() => setShowHelp((open) => !open)}>?</button></div>
    <div className="input-cell"><input aria-label="Valuation date" type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>
    {showHelp && <p className="field-help">{help}</p>}
  </div>;
}
