const NUMBER_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const LETTER_ROWS = [
  ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"],
  ["N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
];

interface LegacyKeyboardProps {
  value: string;
  onChange: (value: string) => void;
}

export function LegacyKeyboard({ value, onChange }: LegacyKeyboardProps) {
  function append(key: string) {
    if (value.length >= 10) {
      return;
    }

    onChange(`${value}${key}`);
  }

  return (
    <div className="keyboard-shell">
      <div className="keyboard-row keyboard-row-number">
        {NUMBER_ROW.map((key) => (
          <button className="keyboard-key" key={key} type="button" onClick={() => append(key)}>
            {key}
          </button>
        ))}
        <button className="keyboard-action wide" type="button" onClick={() => onChange(value.slice(0, -1))}>
          ←
        </button>
      </div>

      {LETTER_ROWS.map((row) => (
        <div className="keyboard-row keyboard-row-letter" key={row.join("-")}>
          {row.map((key) => (
            <button className="keyboard-key" key={key} type="button" onClick={() => append(key)}>
              {key}
            </button>
          ))}
        </div>
      ))}

      <div className="keyboard-actions">
        <button className="keyboard-action clear" type="button" onClick={() => onChange("")}>
          清除全部
        </button>
      </div>
    </div>
  );
}
