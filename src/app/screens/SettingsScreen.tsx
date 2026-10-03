import { useRef, useState } from 'react';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { getSettings, replaceSettings, setSettings, useSettings, type Settings } from '../settings.ts';
import { Tap } from '../ui/Tap.tsx';
import { ScreenHead } from './ScreenHead.tsx';

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="field__label" id={`lbl-${label}`}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={`lbl-${label}`}>
        {options.map((o) => (
          <Tap key={String(o.v)} fb="toggle.on" role="radio" aria-checked={o.v === value} className={`segmented__opt${o.v === value ? ' is-on' : ''}`} onTap={() => onChange(o.v)}>
            {o.label}
          </Tap>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, note }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <div className="field field--row">
      <span className="field__text">
        <span className="field__label">{label}</span>
        {note ? <span className="field__note">{note}</span> : null}
      </span>
      <Tap fb={value ? 'toggle.off' : 'toggle.on'} role="switch" aria-checked={value} aria-label={label} className={`switch${value ? ' is-on' : ''}`} onTap={() => onChange(!value)}>
        <span className="switch__knob" />
      </Tap>
    </div>
  );
}

export function SettingsScreen() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = async () => {
    const backup = await engine().call('exportBackup');
    const blob = new Blob([JSON.stringify({ ...backup, settings: getSettings() })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `loupe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setSettings({ lastBackupAt: Date.now() });
    setMsg(`Saved ${backup.tables.evaluations.length} evaluations to a backup file.`);
  };

  const doImport = async (file: File) => {
    try {
      const json = JSON.parse(await file.text()) as { settings?: Partial<Settings> };
      const r = await engine().call('importBackup', json);
      if (json.settings) replaceSettings(json.settings);
      feedback('action.primary');
      setMsg(`Restored ${r.evaluations} evaluations. Reload to continue from the backup.`);
    } catch (e) {
      feedback('filter.error');
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="screen settings">
      <ScreenHead title="Settings" />
      <section className="group">
        <h2 className="section-title smallcaps">Practice</h2>
        <Segmented
          label="Session length"
          value={s.sessionLength}
          options={[
            { v: 10, label: '10' },
            { v: 20, label: '20' },
            { v: 40, label: '40' },
            { v: 0, label: 'Endless' },
          ]}
          onChange={(v) => setSettings({ sessionLength: v })}
        />
        <Segmented
          label="Daily goal"
          value={s.dailyGoal}
          options={[
            { v: 15, label: '15' },
            { v: 30, label: '30' },
            { v: 60, label: '60' },
            { v: 100, label: '100' },
          ]}
          onChange={(v) => setSettings({ dailyGoal: v })}
        />
        <Segmented
          label="Card selection"
          value={s.mode}
          options={[
            { v: 'adaptive', label: 'Adaptive' },
            { v: 'random', label: 'Random' },
          ]}
          onChange={(v) => setSettings({ mode: v })}
        />
        <Toggle label="Keyboard hints" value={s.showKeyHints} onChange={(v) => setSettings({ showKeyHints: v })} note="Letter, then + / − / Enter" />
      </section>
      <section className="group">
        <h2 className="section-title smallcaps">Sound, haptics, motion</h2>
        <div className="field">
          <label className="field__label" htmlFor="vol">
            Volume
          </label>
          <input
            id="vol"
            className="range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => setSettings({ volume: Number(e.target.value) })}
            onPointerUp={() => feedback('reveal.close')}
            onKeyUp={() => feedback('reveal.close')}
          />
        </div>
        <Toggle label="Mute" value={s.muted} onChange={(v) => setSettings({ muted: v })} />
        <Toggle label="Haptics" value={s.haptics} onChange={(v) => setSettings({ haptics: v })} note="Where the device supports vibration" />
        <Segmented
          label="Reduce motion"
          value={s.reducedMotion}
          options={[
            { v: 'system', label: 'System' },
            { v: 'on', label: 'On' },
            { v: 'off', label: 'Off' },
          ]}
          onChange={(v) => setSettings({ reducedMotion: v })}
        />
      </section>
      <section className="group">
        <h2 className="section-title smallcaps">Your data</h2>
        <p className="field__note">Progress is stored only on this device. Some browsers (iOS Safari) can clear a site's storage after a week without a visit unless the app is on the Home Screen, so keep a backup.</p>
        <div className="row-actions">
          <Tap fb="action.primary" className="btn btn--primary" onTap={() => void doExport()}>
            Export backup
          </Tap>
          <Tap fb="action.secondary" className="btn" onTap={() => fileRef.current?.click()}>
            Import backup
          </Tap>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
        </div>
        {msg && (
          <p className="notice" role="status">
            {msg}
          </p>
        )}
        {s.lastBackupAt > 0 && <p className="field__note">Last backup {new Date(s.lastBackupAt).toLocaleDateString()}</p>}
      </section>
    </div>
  );
}
