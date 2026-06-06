import React, { useState, useCallback } from 'react';

interface FakeCalculatorProps {
  onDismiss: () => void;
}

type CalcButton = {
  label: string;
  value: string;
  type: 'number' | 'operator' | 'action' | 'equals';
  wide?: boolean;
};

const BUTTONS: CalcButton[] = [
  { label: 'AC', value: 'AC', type: 'action' },
  { label: '+/-', value: '+/-', type: 'action' },
  { label: '%', value: '%', type: 'action' },
  { label: '÷', value: '/', type: 'operator' },
  { label: '7', value: '7', type: 'number' },
  { label: '8', value: '8', type: 'number' },
  { label: '9', value: '9', type: 'number' },
  { label: '×', value: '*', type: 'operator' },
  { label: '4', value: '4', type: 'number' },
  { label: '5', value: '5', type: 'number' },
  { label: '6', value: '6', type: 'number' },
  { label: '−', value: '-', type: 'operator' },
  { label: '1', value: '1', type: 'number' },
  { label: '2', value: '2', type: 'number' },
  { label: '3', value: '3', type: 'number' },
  { label: '+', value: '+', type: 'operator' },
  { label: '0', value: '0', type: 'number', wide: true },
  { label: '.', value: '.', type: 'number' },
  { label: '=', value: '=', type: 'equals' },
];

export default function FakeCalculator({ onDismiss }: FakeCalculatorProps) {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<string | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [acPressCount, setAcPressCount] = useState(0);
  const [acTimer, setAcTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const formatDisplay = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (Math.abs(num) >= 1e9) return num.toExponential(3);
    // Up to 9 digits displayed
    const str = val.endsWith('.') ? val : String(parseFloat(val.slice(0, 16)));
    return str;
  };

  const handleButton = useCallback((btn: CalcButton) => {
    if (btn.value === 'AC') {
      // Triple-press AC to dismiss panic mode
      const newCount = acPressCount + 1;
      setAcPressCount(newCount);
      if (acTimer) clearTimeout(acTimer);
      const t = setTimeout(() => setAcPressCount(0), 1000);
      setAcTimer(t);
      if (newCount >= 3) {
        setAcPressCount(0);
        onDismiss();
        return;
      }
      // Normal AC
      setDisplay('0');
      setPrevValue(null);
      setOperator(null);
      setWaitingForOperand(false);
      return;
    }

    if (btn.type === 'number') {
      if (btn.value === '.' && display.includes('.')) return;
      if (waitingForOperand) {
        setDisplay(btn.value === '.' ? '0.' : btn.value);
        setWaitingForOperand(false);
      } else {
        setDisplay(display === '0' && btn.value !== '.' ? btn.value : display + btn.value);
      }
      return;
    }

    if (btn.type === 'action') {
      if (btn.value === '+/-') {
        setDisplay(String(parseFloat(display) * -1));
        return;
      }
      if (btn.value === '%') {
        setDisplay(String(parseFloat(display) / 100));
        return;
      }
    }

    if (btn.type === 'operator') {
      setWaitingForOperand(true);
      if (prevValue !== null && operator && !waitingForOperand) {
        const result = calculate(parseFloat(prevValue), parseFloat(display), operator);
        setDisplay(String(result));
        setPrevValue(String(result));
      } else {
        setPrevValue(display);
      }
      setOperator(btn.value);
      return;
    }

    if (btn.type === 'equals') {
      if (prevValue !== null && operator) {
        const result = calculate(parseFloat(prevValue), parseFloat(display), operator);
        const resultStr = String(result);
        setDisplay(resultStr);
        setPrevValue(null);
        setOperator(null);
        setWaitingForOperand(true);
      }
    }
  }, [display, prevValue, operator, waitingForOperand, acPressCount, acTimer, onDismiss]);

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const getButtonStyle = (btn: CalcButton) => {
    if (btn.type === 'operator') {
      return 'bg-[#ff9f0a] hover:bg-[#ffb340] active:bg-[#ff9f0a] text-white';
    }
    if (btn.type === 'equals') {
      return 'bg-[#ff9f0a] hover:bg-[#ffb340] active:bg-[#ff9f0a] text-white';
    }
    if (btn.type === 'action') {
      return 'bg-[#636366] hover:bg-[#7c7c80] active:bg-[#636366] text-white';
    }
    return 'bg-[#333335] hover:bg-[#4a4a4d] active:bg-[#333335] text-white';
  };

  const displayStr = formatDisplay(display);
  const fontSize = displayStr.length > 9
    ? 'text-4xl'
    : displayStr.length > 6
    ? 'text-5xl'
    : 'text-6xl';

  return (
    <div
      className="panic-overlay select-none"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
    >
      <div className="w-full max-w-[320px] mx-auto flex flex-col" style={{ height: '100dvh', maxHeight: '680px', justifyContent: 'flex-end', paddingBottom: '8px' }}>
        
        {/* Display */}
        <div className="px-6 pb-4 pt-8 flex flex-col items-end justify-end" style={{ minHeight: '140px' }}>
          <div
            className={`calc-display font-light text-white text-right leading-none transition-all duration-100 ${fontSize}`}
            style={{ fontWeight: 200 }}
          >
            {displayStr}
          </div>
          {acPressCount > 0 && (
            <div className="text-[10px] text-[#636366] mt-2 font-medium tracking-widest">
              {'AC ×' + acPressCount} — press {3 - acPressCount} more to exit
            </div>
          )}
        </div>

        {/* Buttons Grid */}
        <div className="px-3 pb-3 grid grid-cols-4 gap-3">
          {BUTTONS.map((btn, i) => (
            <button
              key={i}
              onClick={() => handleButton(btn)}
              className={`
                flex items-center justify-center rounded-full text-2xl font-medium
                transition-all duration-75 active:scale-95 cursor-pointer
                ${btn.wide ? 'col-span-2 justify-start pl-6' : ''}
                ${getButtonStyle(btn)}
              `}
              style={{ height: '72px' }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Subtle hint */}
        <div className="text-center pb-4">
          <span className="text-[10px] text-[#3a3a3c] tracking-widest uppercase font-medium">
            Tap AC × 3 to return
          </span>
        </div>
      </div>
    </div>
  );
}
